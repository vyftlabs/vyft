import type {
  Change,
  ExtendedRuntime,
  Operation,
  RuntimeOptions,
  Service,
} from "@vyft/core";
import { changedFields, hasSpecChange } from "@vyft/core";
import * as log from "@vyft/core/logger";
import type { CaddyRoute } from "./caddy.ts";
import type { DockerClient } from "./client.ts";
import { createDockerClient } from "./client.ts";
import { createCronContainer, recreateCronContainer } from "./cronjob.ts";
import { normalizeDockerContainer } from "./inspect.ts";
import { ensureNetwork, removeNetwork } from "./network.ts";
import { deployProxy, removeProxy } from "./proxy.ts";
import {
  createContainer,
  recreateContainer,
  removeContainer,
  warnReplicas,
} from "./service.ts";
import { createVolume, removeVolume } from "./volume.ts";

export type DockerRuntimeOptions = RuntimeOptions & { client?: DockerClient };

/** Docker-based runtime — single-host containers with Caddy reverse proxy. */
export function createDockerRuntime(
  opts: DockerRuntimeOptions,
): ExtendedRuntime {
  const { project, secrets } = opts;
  const client = opts.client ?? createDockerClient();
  const networkName = `vyft-${project}`;
  const proxyName = `vyft-${project}-proxy`;

  const composeLabels = { "com.docker.compose.project": networkName };
  let networkReady = false;
  const containerIds = new Map<string, string>();

  async function initNetwork(): Promise<void> {
    if (networkReady) return;
    await ensureNetwork(client, networkName, composeLabels);
    networkReady = true;
  }

  function volumeName(id: string): string {
    return `vyft-${project}-${id}`;
  }

  function containerName(id: string): string {
    return `vyft-${project}-${id}`;
  }

  return {
    plan(change: Change): Operation[] {
      if (change.status === "remove") {
        return [{ action: "remove", id: change.id, kind: change.kind }];
      }

      if (change.resource.kind === "secret") {
        return [];
      }

      if (change.resource.kind === "volume" && change.status === "modify") {
        return [];
      }

      if (change.resource.kind === "service" && change.status === "modify") {
        if (!change.previous)
          return [{ action: "recreate", resource: change.resource }];
        const changed = changedFields(change.previous, change.resource.config);
        if (!hasSpecChange(changed)) return [];
        return [{ action: "recreate", resource: change.resource }];
      }

      if (change.resource.kind === "cronjob" && change.status === "modify") {
        if (!change.previous)
          return [{ action: "recreate", resource: change.resource }];
        const changed = changedFields(change.previous, change.resource.config);
        if (!hasSpecChange(changed)) return [];
        return [{ action: "recreate", resource: change.resource }];
      }

      return [
        {
          action: change.status === "create" ? "create" : "update",
          resource: change.resource,
        },
      ];
    },

    async execute(op: Operation): Promise<void> {
      await initNetwork();

      if (op.action === "remove") {
        if (op.kind === "volume") {
          await removeVolume(client, volumeName(op.id));
        } else if (op.kind === "service" || op.kind === "cronjob") {
          await removeContainer(client, containerName(op.id));
          containerIds.delete(op.id);
        }
        return;
      }

      const resource = op.resource;

      if (resource.kind === "volume") {
        await createVolume(client, volumeName(resource.id), composeLabels);
        return;
      }

      if (resource.kind === "service") {
        warnReplicas(resource.id, resource.config);
        if (op.action === "recreate") {
          const cid = await recreateContainer(
            client,
            containerName(resource.id),
            resource.id,
            resource.config,
            networkName,
            secrets,
            project,
          );
          containerIds.set(resource.id, cid);
        } else {
          const cid = await createContainer(
            client,
            containerName(resource.id),
            resource.id,
            resource.config,
            networkName,
            secrets,
            project,
          );
          containerIds.set(resource.id, cid);
        }
        return;
      }

      if (resource.kind === "cronjob") {
        if (op.action === "recreate") {
          const cid = await recreateCronContainer(
            client,
            containerName(resource.id),
            resource.id,
            resource.config,
            networkName,
            secrets,
            project,
          );
          containerIds.set(resource.id, cid);
        } else {
          const cid = await createCronContainer(
            client,
            containerName(resource.id),
            resource.id,
            resource.config,
            networkName,
            secrets,
            project,
          );
          containerIds.set(resource.id, cid);
        }
        return;
      }
    },

    async inspect(
      id: string,
      kind: string,
    ): Promise<Record<string, unknown> | null> {
      if (kind === "secret") return null;

      if (kind === "volume") {
        try {
          await client.get(`/volumes/${volumeName(id)}`);
          return {};
        } catch {
          return null;
        }
      }

      if (kind === "service" || kind === "cronjob") {
        try {
          const info = await client.get(
            `/containers/${containerName(id)}/json`,
          );
          return normalizeDockerContainer(info);
        } catch {
          return null;
        }
      }

      return null;
    },

    async waitForHealthy(resourceId: string, timeout: number): Promise<void> {
      const cid = containerIds.get(resourceId);
      if (!cid) return;

      const start = Date.now();
      while (Date.now() - start < timeout) {
        const info = (await client.get(`/containers/${cid}/json`)) as {
          State?: { Health?: { Status: string } };
        };

        const status = info.State?.Health?.Status;
        if (!status) return;
        if (status === "healthy") return;
        if (status === "unhealthy") {
          throw new Error(`Service "${resourceId}" failed health check`);
        }

        await new Promise((r) => setTimeout(r, 2000));
      }

      throw new Error(
        `Service "${resourceId}" did not become healthy within ${timeout}ms`,
      );
    },

    async finalize(currentServices: Service[]): Promise<void> {
      const routes: CaddyRoute[] = [];
      for (const svc of currentServices) {
        if (svc.config.route) {
          routes.push({
            match: svc.config.route,
            upstream: `${svc.id}:${svc.port}`,
          });
        }
      }

      if (routes.length > 0) {
        await initNetwork();
        await deployProxy(client, proxyName, networkName, routes);
        log.info("proxy updated with %d route(s)", routes.length);
      } else {
        await removeProxy(client, proxyName);
        log.debug("proxy removed (no routes)");
      }
    },

    async teardown(): Promise<void> {
      await removeProxy(client, proxyName);
      await removeNetwork(client, networkName);
    },

    runtimeState(): Map<string, Record<string, unknown>> {
      const state = new Map<string, Record<string, unknown>>();
      for (const [id, cid] of containerIds) {
        state.set(id, { containerId: cid });
      }
      return state;
    },
  };
}
