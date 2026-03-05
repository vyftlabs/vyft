import { logger } from "@vyft/logger";
import type { Service } from "@vyft/primitives";
import type { ExtendedRuntime, Operation, RuntimeOptions } from "../types.ts";
import type { K8sClient } from "./client.ts";
import { loadK8sClient } from "./client.ts";
import { applyCronJob, deleteCronJob } from "./cronjob.ts";
import { normalizeK8sDeployment } from "./inspect.ts";
import { deleteNamespace, ensureNamespace } from "./namespace.ts";
import { ensureK8sRegistry, portForwardRegistry } from "./registry.ts";
import { applyIngress, deleteIngress } from "./routing.ts";
import { applyService, deleteService } from "./service.ts";
import { createPVC, deletePVC } from "./volume.ts";

const log = logger.child("kubernetes");

export type K8sRuntimeOptions = RuntimeOptions & { client?: K8sClient };

/** Kubernetes-based runtime — Deployments, Services, Ingress. */
export function createK8sRuntime(opts: K8sRuntimeOptions): ExtendedRuntime {
  const { project, stage, secrets } = opts;
  const namespace = `vyft-${project}-${stage}`;

  let client: K8sClient | null = opts.client ?? null;
  let namespaceReady = false;
  let registryAddrs: { local: string; cluster: string } | null = null;
  let portForward: { kill: () => void } | null = null;

  async function getClient(): Promise<K8sClient> {
    if (!client) client = await loadK8sClient();
    return client;
  }

  async function initNamespace(): Promise<void> {
    if (namespaceReady) return;
    const k = await getClient();
    await ensureNamespace(k, namespace);
    namespaceReady = true;
  }

  async function ensureBuildRegistry(): Promise<{
    local: string;
    cluster: string;
  }> {
    if (registryAddrs) return registryAddrs;
    const k = await getClient();
    registryAddrs = await ensureK8sRegistry(k);
    portForward = portForwardRegistry();
    await new Promise((r) => setTimeout(r, 2000));
    return registryAddrs;
  }

  function pvcName(id: string): string {
    return id;
  }

  function getImageUtils() {
    if (!opts.imageUtils) {
      throw new Error(
        "imageUtils required for build operations in kubernetes runtime",
      );
    }
    return opts.imageUtils;
  }

  return {
    async execute(op: Operation): Promise<void> {
      await initNamespace();
      const k = await getClient();

      if (op.action === "remove") {
        if (op.kind === "volume") {
          await deletePVC(k, namespace, pvcName(op.id));
        } else if (op.kind === "service") {
          await deleteService(k, namespace, op.id);
        } else if (op.kind === "cronjob") {
          await deleteCronJob(k, namespace, op.id);
        }
        return;
      }

      const resource = op.resource;

      // Variables/secrets are state-only
      if (resource.kind === "variable") return;

      if (resource.kind === "volume") {
        if (op.action === "update") return; // PVCs are immutable
        await createPVC(k, namespace, pvcName(resource.id), resource.config);
        return;
      }

      if (resource.kind === "service") {
        if (resource.config.build) {
          const { buildImage, pushImage } = getImageUtils();
          const reg = await ensureBuildRegistry();
          const localTag = `vyft-build-${resource.id}:latest`;
          const remoteTag = `${reg.local}/vyft-${resource.id}:latest`;
          await buildImage(localTag, resource.config.build);
          await pushImage(localTag, remoteTag);
        }

        await applyService(k, namespace, resource.id, resource.config, secrets);
        return;
      }

      if (resource.kind === "cronjob") {
        if (resource.config.build) {
          const { buildImage, pushImage } = getImageUtils();
          const reg = await ensureBuildRegistry();
          const localTag = `vyft-build-${resource.id}:latest`;
          const remoteTag = `${reg.local}/vyft-${resource.id}:latest`;
          await buildImage(localTag, resource.config.build);
          await pushImage(localTag, remoteTag);
        }

        await applyCronJob(k, namespace, resource.id, resource.config, secrets);
        return;
      }
    },

    async inspect(
      id: string,
      kind: string,
    ): Promise<Record<string, unknown> | null> {
      const k = await getClient();

      if (kind === "secret" || kind === "variable" || kind === "config")
        return null;

      if (kind === "volume") {
        try {
          await k.readPVC({ name: id, namespace });
          return {};
        } catch {
          return null;
        }
      }

      if (kind === "service") {
        try {
          const dep = await k.readDeployment({ name: id, namespace });
          return normalizeK8sDeployment(dep);
        } catch {
          return null;
        }
      }

      if (kind === "cronjob") {
        try {
          await k.readCronJob({ name: id, namespace });
          return {};
        } catch {
          return null;
        }
      }

      return null;
    },

    async waitForHealthy(resourceId: string, timeout: number): Promise<void> {
      const k = await getClient();
      const start = Date.now();

      while (Date.now() - start < timeout) {
        const dep = (await k.readDeployment({
          name: resourceId,
          namespace,
        })) as {
          spec?: { replicas?: number };
          status?: {
            readyReplicas?: number;
            conditions?: { type: string; status: string }[];
          };
        };

        const desired = dep.spec?.replicas ?? 1;
        const ready = dep.status?.readyReplicas ?? 0;
        const available = dep.status?.conditions?.find(
          (c) => c.type === "Available",
        );

        if (ready >= desired && available?.status === "True") return;

        const progressing = dep.status?.conditions?.find(
          (c) => c.type === "Progressing",
        );
        if (progressing?.status === "False") {
          throw new Error(`Deployment "${resourceId}" failed to progress`);
        }

        await new Promise((r) => setTimeout(r, 2000));
      }

      throw new Error(
        `Deployment "${resourceId}" did not become healthy within ${timeout}ms`,
      );
    },

    async finalize(currentServices: Service[]): Promise<void> {
      const k = await getClient();

      for (const svc of currentServices) {
        if (svc.config.route) {
          await applyIngress(k, namespace, svc.id, svc.config.route, svc.port);
        } else {
          await deleteIngress(k, namespace, svc.id);
        }
      }

      log.info("ingress resources updated");
    },

    async teardown(): Promise<void> {
      const k = await getClient();
      await deleteNamespace(k, namespace);
      if (portForward) portForward.kill();
    },

    runtimeState(): Map<string, Record<string, unknown>> {
      return new Map();
    },
  };
}
