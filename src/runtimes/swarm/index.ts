import type { Change } from "../../engine/plan.ts";
import * as log from "../../logger.ts";
import type { Service } from "../../resource.ts";
import { changedFields, hasSpecChange } from "../diff.ts";
import type { CaddyRoute } from "../docker/caddy.ts";
import type { DockerClient } from "../docker/client.ts";
import { createDockerClient } from "../docker/client.ts";
import { buildCronImage } from "../docker/cronjob.ts";
import { createVolume, removeVolume } from "../docker/volume.ts";
import { buildImage, pushImage } from "../image.ts";
import type { ExtendedRuntime, Operation, RuntimeOptions } from "../types.ts";
import { buildCronServiceSpec } from "./cronjob.ts";
import { normalizeSwarmService } from "./inspect.ts";
import { deploySwarmProxy, removeSwarmProxy } from "./proxy.ts";
import { ensureRegistry } from "./registry.ts";
import {
  buildServiceSpec,
  createSwarmService,
  removeSwarmService,
  updateSwarmService,
} from "./service.ts";

export type SwarmRuntimeOptions = RuntimeOptions & { client?: DockerClient };

/** Swarm-based runtime — multi-node with in-place rolling updates. */
export function createSwarmRuntime(opts: SwarmRuntimeOptions): ExtendedRuntime {
  const { project, secrets } = opts;
  const client = opts.client ?? createDockerClient();
  const networkName = `vyft-${project}`;
  const proxyName = `vyft-${project}-proxy`;

  let networkReady = false;
  let registryAddr: string | null = null;
  const serviceIds = new Map<string, string>();

  async function initNetwork(): Promise<string> {
    if (networkReady) return networkName;
    // Create overlay network (attachable so standalone containers can join).
    // Swarm returns 500 (not 409) for duplicates via gRPC, so catch and verify.
    try {
      await client.post("/networks/create", {
        Name: networkName,
        Driver: "overlay",
        Attachable: true,
        CheckDuplicate: true,
        Labels: { "com.docker.stack.namespace": networkName },
      });
    } catch {
      // Network may already exist — verify it's there
      await client.get(`/networks/${networkName}`);
    }
    networkReady = true;
    return networkName;
  }

  async function ensureBuildRegistry(): Promise<string> {
    if (registryAddr) return registryAddr;
    registryAddr = await ensureRegistry(client);
    return registryAddr;
  }

  function svcName(id: string): string {
    return `vyft-${project}-${id}`;
  }

  function volName(id: string): string {
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
          return [{ action: "update", resource: change.resource }];
        const changed = changedFields(change.previous, change.resource.config);
        if (changed.has("replicas") && !hasSpecChange(changed)) {
          return [{ action: "update", resource: change.resource }]; // scale without restart
        }
        if (!hasSpecChange(changed)) return []; // route/dev only — no-op
        return [{ action: "update", resource: change.resource }];
      }

      if (change.resource.kind === "cronjob" && change.status === "modify") {
        if (!change.previous)
          return [{ action: "update", resource: change.resource }];
        const changed = changedFields(change.previous, change.resource.config);
        if (!hasSpecChange(changed)) return [];
        return [{ action: "update", resource: change.resource }];
      }

      return [
        {
          action: change.status === "create" ? "create" : "update",
          resource: change.resource,
        },
      ];
    },

    async execute(op: Operation): Promise<void> {
      const networkId = await initNetwork();

      if (op.action === "remove") {
        if (op.kind === "volume") {
          await removeVolume(client, volName(op.id));
        } else if (op.kind === "service" || op.kind === "cronjob") {
          await removeSwarmService(client, svcName(op.id));
          serviceIds.delete(op.id);
        }
        return;
      }

      const resource = op.resource;

      if (resource.kind === "volume") {
        await createVolume(client, volName(resource.id), {
          "com.docker.stack.namespace": networkName,
        });
        return;
      }

      if (resource.kind === "service") {
        // Build and push if has build config
        if (resource.config.build) {
          const registry = await ensureBuildRegistry();
          const localTag = `vyft-build-${resource.id}:latest`;
          const remoteTag = `${registry}/vyft-${resource.id}:latest`;
          await buildImage(localTag, resource.config.build);
          await pushImage(localTag, remoteTag);
        }

        const spec = buildServiceSpec(
          svcName(resource.id),
          resource.id,
          resource.config,
          networkId,
          secrets,
          project,
        );

        if (op.action === "create") {
          const sid = await createSwarmService(client, spec);
          serviceIds.set(resource.id, sid);
        } else {
          await updateSwarmService(client, svcName(resource.id), spec);
        }
        return;
      }

      if (resource.kind === "cronjob") {
        // Build user image, then wrap with supercronic
        let baseImage =
          resource.config.image ?? `vyft-build-${resource.id}:latest`;
        if (resource.config.build) {
          baseImage = `vyft-build-${resource.id}:latest`;
          await buildImage(baseImage, resource.config.build);
        }

        const cronTag = `vyft-cron-${resource.id}:latest`;
        await buildCronImage(
          cronTag,
          baseImage,
          resource.config.schedule,
          resource.config.command ?? "true",
        );

        // Push cron image to swarm registry
        const registry = await ensureBuildRegistry();
        const remoteTag = `${registry}/vyft-cron-${resource.id}:latest`;
        await pushImage(cronTag, remoteTag);

        const spec = buildCronServiceSpec(
          svcName(resource.id),
          resource.id,
          remoteTag,
          resource.config,
          networkId,
          secrets,
          project,
        );

        if (op.action === "create") {
          const sid = await createSwarmService(client, spec);
          serviceIds.set(resource.id, sid);
        } else {
          await updateSwarmService(client, svcName(resource.id), spec);
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
          await client.get(`/volumes/${volName(id)}`);
          return {};
        } catch {
          return null;
        }
      }

      if (kind === "service" || kind === "cronjob") {
        try {
          const services = (await client.get(
            `/services?filters=${encodeURIComponent(JSON.stringify({ name: [svcName(id)] }))}`,
          )) as unknown[];
          if (!services.length) return null;
          return normalizeSwarmService(services[0]);
        } catch {
          return null;
        }
      }

      return null;
    },

    async waitForHealthy(resourceId: string, timeout: number): Promise<void> {
      const name = svcName(resourceId);
      const start = Date.now();

      while (Date.now() - start < timeout) {
        const tasks = (await client.get(
          `/tasks?filters=${encodeURIComponent(JSON.stringify({ service: [name], "desired-state": ["running"] }))}`,
        )) as { Status: { State: string } }[];

        if (
          tasks.length > 0 &&
          tasks.every((t) => t.Status.State === "running")
        ) {
          return;
        }

        const failed = tasks.find(
          (t) => t.Status.State === "failed" || t.Status.State === "rejected",
        );
        if (failed) {
          throw new Error(
            `Service "${resourceId}" task failed with state "${failed.Status.State}"`,
          );
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
        const networkId = await initNetwork();
        await deploySwarmProxy(client, proxyName, networkId, routes);
        log.info("proxy updated with %d route(s)", routes.length);
      } else {
        await removeSwarmProxy(client, proxyName);
        log.debug("proxy removed (no routes)");
      }
    },

    async teardown(): Promise<void> {
      await removeSwarmProxy(client, proxyName);
      try {
        await client.del(`/networks/${networkName}`);
      } catch {
        // Network may not exist
      }
    },

    runtimeState(): Map<string, Record<string, unknown>> {
      const state = new Map<string, Record<string, unknown>>();
      for (const [id, sid] of serviceIds) {
        state.set(id, { swarmServiceId: sid });
      }
      return state;
    },
  };
}
