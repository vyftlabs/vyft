import type {
  BindMount,
  EnvValue,
  HealthCheck,
  ServiceConfig,
} from "@vyft/core";
import { durationToSeconds, resolveEnv } from "@vyft/core";
import type { K8sClient } from "./client.ts";

interface DeploymentManifest {
  metadata: { name: string; namespace: string; labels: Record<string, string> };
  spec: {
    replicas: number;
    selector: { matchLabels: Record<string, string> };
    strategy: {
      type: string;
      rollingUpdate: { maxSurge: number; maxUnavailable: number };
    };
    template: {
      metadata: { labels: Record<string, string> };
      spec: Record<string, unknown>;
    };
  };
  [key: string]: unknown;
}

interface ClusterIPManifest {
  metadata: { name: string; namespace: string; labels: Record<string, string> };
  spec: {
    type: string;
    selector: Record<string, string>;
    ports: { port: number; targetPort: number; protocol: string }[];
  };
  [key: string]: unknown;
}

/** Build a Deployment manifest from config. */
export function buildDeploymentManifest(
  name: string,
  namespace: string,
  id: string,
  config: ServiceConfig,
  secrets: ReadonlyMap<string, string>,
): DeploymentManifest {
  const labels = {
    "app.kubernetes.io/name": id,
    "app.kubernetes.io/managed-by": "vyft",
  };
  const image = config.image ?? `localhost:5000/vyft-${id}:latest`;
  const port = config.port ?? 3000;

  const env = config.env
    ? resolveEnv(config.env as Record<string, EnvValue>, secrets)
    : {};
  const envArr = Object.entries(env).map(([k, v]) => ({ name: k, value: v }));

  const volumeMounts = config.mounts?.map((m) => ({
    name: `vol-${m.source.id}`,
    mountPath: m.path,
  }));

  const volumes = config.mounts?.map((m) => {
    if (m.source.kind === "bind") {
      return {
        name: `vol-${m.source.id}`,
        hostPath: { path: (m.source as unknown as BindMount).hostPath },
      };
    }
    return {
      name: `vol-${m.source.id}`,
      persistentVolumeClaim: { claimName: m.source.id },
    };
  });

  const container: Record<string, unknown> = {
    name: id,
    image,
    ports: [{ containerPort: port }],
  };
  if (envArr.length > 0) container["env"] = envArr;
  if (volumeMounts?.length) container["volumeMounts"] = volumeMounts;

  if (config.command) {
    container["command"] = Array.isArray(config.command)
      ? config.command
      : ["sh", "-c", config.command];
  }

  if (config.health) {
    const probe = buildProbe(config.health);
    container["livenessProbe"] = probe;
    container["readinessProbe"] = probe;
  }

  const podSpec: Record<string, unknown> = {
    containers: [container],
  };

  if (volumes?.length) {
    podSpec["volumes"] = volumes;
  }

  return {
    metadata: { name, namespace, labels },
    spec: {
      replicas: config.replicas ?? 1,
      selector: { matchLabels: { "app.kubernetes.io/name": id } },
      strategy: {
        type: "RollingUpdate",
        rollingUpdate: { maxSurge: 1, maxUnavailable: 0 },
      },
      template: {
        metadata: { labels },
        spec: podSpec,
      },
    },
  };
}

/** Build a ClusterIP Service manifest. */
export function buildClusterIPManifest(
  name: string,
  namespace: string,
  id: string,
  port: number,
): ClusterIPManifest {
  return {
    metadata: {
      name,
      namespace,
      labels: {
        "app.kubernetes.io/name": id,
        "app.kubernetes.io/managed-by": "vyft",
      },
    },
    spec: {
      type: "ClusterIP",
      selector: { "app.kubernetes.io/name": id },
      ports: [{ port, targetPort: port, protocol: "TCP" }],
    },
  };
}

function buildProbe(health: HealthCheck): Record<string, unknown> {
  const probe: Record<string, unknown> = {
    exec: { command: ["sh", "-c", health.command] },
  };
  if (health.interval)
    probe["periodSeconds"] = durationToSeconds(health.interval);
  if (health.timeout)
    probe["timeoutSeconds"] = durationToSeconds(health.timeout);
  if (health.retries !== undefined) probe["failureThreshold"] = health.retries;
  if (health.startPeriod)
    probe["initialDelaySeconds"] = durationToSeconds(health.startPeriod);
  return probe;
}

/** Apply (create or update) a Deployment + ClusterIP Service. */
export async function applyService(
  client: K8sClient,
  namespace: string,
  id: string,
  config: ServiceConfig,
  secrets: ReadonlyMap<string, string>,
): Promise<void> {
  const name = id;
  const port = config.port ?? 3000;
  const deployment = buildDeploymentManifest(
    name,
    namespace,
    id,
    config,
    secrets,
  );
  const clusterIP = buildClusterIPManifest(name, namespace, id, port);

  // Deployment: try replace, fall back to create
  try {
    await client.replaceDeployment({ namespace, name, body: deployment });
  } catch (err: unknown) {
    if (isNotFound(err)) {
      await client.createDeployment({ namespace, body: deployment });
    } else {
      throw err;
    }
  }

  // ClusterIP Service: try replace, fall back to create
  try {
    await client.replaceService({ namespace, name, body: clusterIP });
  } catch (err: unknown) {
    if (isNotFound(err)) {
      await client.createService({ namespace, body: clusterIP });
    } else {
      throw err;
    }
  }
}

/** Delete a Deployment + ClusterIP Service. */
export async function deleteService(
  client: K8sClient,
  namespace: string,
  id: string,
): Promise<void> {
  try {
    await client.deleteDeployment({ namespace, name: id });
  } catch (err: unknown) {
    if (!isNotFound(err)) throw err;
  }
  try {
    await client.deleteService({ namespace, name: id });
  } catch (err: unknown) {
    if (!isNotFound(err)) throw err;
  }
}

function isNotFound(err: unknown): boolean {
  if (typeof err === "object" && err !== null) {
    const e = err as Record<string, unknown>;
    if (e["statusCode"] === 404 || e["code"] === 404) return true;
    if (typeof e["response"] === "object" && e["response"] !== null) {
      const resp = e["response"] as Record<string, unknown>;
      if (resp["statusCode"] === 404) return true;
    }
  }
  return false;
}
