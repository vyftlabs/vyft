import { logger } from "@vyft/logger";
import type { Service } from "@vyft/primitives";
import type { ExtendedRuntime, Operation, RuntimeOptions } from "../types.ts";
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

const log = logger.child("docker");

export type DockerRuntimeOptions = RuntimeOptions & {
  client?: DockerClient;
  portBindings?: Record<string, number>;
};

/** Docker-based runtime — single-host containers with Caddy reverse proxy. */
export function createDockerRuntime(
  opts: DockerRuntimeOptions,
): ExtendedRuntime {
  const { project, stage, secrets } = opts;
  const client = opts.client ?? createDockerClient();
  const portBindingsMap = opts.portBindings ?? {};
  const networkName = `vyft-${project}-${stage}`;
  const proxyName = `vyft-${project}-${stage}-proxy`;

  const composeLabels = { "com.docker.compose.project": networkName };
  let networkReady = false;
  const containerIds = new Map<string, string>();

  async function pullImage(image: string): Promise<void> {
    try {
      await client.get(`/images/${encodeURIComponent(image)}/json`);
      return;
    } catch {
      // Not found locally — pull it
    }
    const idx = image.lastIndexOf(":");
    const repo = idx > 0 ? image.slice(0, idx) : image;
    const tag = idx > 0 ? image.slice(idx + 1) : "latest";
    try {
      await client.post(
        `/images/create?fromImage=${encodeURIComponent(repo)}&tag=${encodeURIComponent(tag)}`,
      );
    } catch (err) {
      // Docker image pull returns NDJSON progress stream, not valid JSON.
      // client.post() fails to parse it — if it's a SyntaxError the pull succeeded.
      if (!(err instanceof SyntaxError)) throw err;
    }
  }

  const imageUtils = Object.assign(
    { pullImage },
    opts.imageUtils?.buildImage
      ? { buildImage: opts.imageUtils.buildImage }
      : {},
  );

  async function initNetwork(): Promise<void> {
    if (networkReady) return;
    await ensureNetwork(client, networkName, composeLabels);
    networkReady = true;
  }

  function volumeName(id: string): string {
    return `vyft-${project}-${stage}-${id}`;
  }

  function containerName(id: string): string {
    return `vyft-${project}-${stage}-${id}`;
  }

  return {
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

      // Variables/secrets are state-only — no runtime action
      if (resource.kind === "variable") return;

      if (resource.kind === "volume") {
        if (op.action === "update") return; // volumes are immutable
        await createVolume(client, volumeName(resource.id), composeLabels);
        return;
      }

      if (resource.kind === "service") {
        warnReplicas(resource.id, resource.config);
        const containerPort = resource.config.port ?? 3000;
        let hostPort: number | undefined = portBindingsMap[resource.id];
        if (hostPort === undefined && resource.config.expose) {
          hostPort =
            resource.config.expose === true
              ? containerPort
              : resource.config.expose;
        }
        const pb = hostPort ? new Map([[containerPort, hostPort]]) : undefined;
        // Docker always recreates on update (stop + start)
        if (op.action === "update") {
          const cid = await recreateContainer(
            client,
            containerName(resource.id),
            resource.id,
            resource.config,
            networkName,
            secrets,
            project,
            stage,
            pb,
            imageUtils,
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
            stage,
            pb,
            imageUtils,
          );
          containerIds.set(resource.id, cid);
        }
        return;
      }

      if (resource.kind === "cronjob") {
        // Docker always recreates cron containers on update
        if (op.action === "update") {
          const cid = await recreateCronContainer(
            client,
            containerName(resource.id),
            resource.id,
            resource.config,
            networkName,
            secrets,
            project,
            imageUtils,
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
            imageUtils,
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
      if (kind === "secret" || kind === "variable" || kind === "config")
        return null; // eslint-disable-line @typescript-eslint/no-unnecessary-condition

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
          const info = (await client.get(
            `/containers/${containerName(id)}/json`,
          )) as { State?: { Running?: boolean } };
          if (!info.State?.Running) return null;
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
