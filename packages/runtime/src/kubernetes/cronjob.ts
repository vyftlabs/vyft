import type {
  BindMount,
  CronJobConfig,
  EnvValue,
  HealthCheck,
} from "@vyft/primitives";
import { durationToSeconds } from "../duration.ts";
import { resolveEnv } from "../resolve.ts";
import type { K8sClient } from "./client.ts";

interface CronJobManifest {
  metadata: { name: string; namespace: string; labels: Record<string, string> };
  spec: {
    schedule: string;
    concurrencyPolicy: string;
    jobTemplate: {
      spec: {
        template: {
          metadata: { labels: Record<string, string> };
          spec: Record<string, unknown>;
        };
        backoffLimit?: number;
      };
    };
  };
  [key: string]: unknown;
}

/** Build a CronJob manifest from config. */
export function buildCronJobManifest(
  name: string,
  namespace: string,
  id: string,
  config: CronJobConfig,
  secrets: ReadonlyMap<string, string>,
): CronJobManifest {
  const labels = {
    "app.kubernetes.io/name": id,
    "app.kubernetes.io/managed-by": "vyft",
  };
  const image = config.image ?? `localhost:5000/vyft-${id}:latest`;

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
  }

  const podSpec: Record<string, unknown> = {
    containers: [container],
    restartPolicy: config.restart === "none" ? "Never" : "OnFailure",
  };

  if (volumes?.length) {
    podSpec["volumes"] = volumes;
  }

  return {
    metadata: { name, namespace, labels },
    spec: {
      schedule: config.schedule,
      concurrencyPolicy: "Forbid",
      jobTemplate: {
        spec: {
          template: {
            metadata: { labels },
            spec: podSpec,
          },
        },
      },
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

/** Apply (create or update) a CronJob. */
export async function applyCronJob(
  client: K8sClient,
  namespace: string,
  id: string,
  config: CronJobConfig,
  secrets: ReadonlyMap<string, string>,
): Promise<void> {
  const name = id;
  const manifest = buildCronJobManifest(name, namespace, id, config, secrets);

  try {
    await client.replaceCronJob({ namespace, name, body: manifest });
  } catch (err: unknown) {
    if (isNotFound(err)) {
      await client.createCronJob({ namespace, body: manifest });
    } else {
      throw err;
    }
  }
}

/** Delete a CronJob. */
export async function deleteCronJob(
  client: K8sClient,
  namespace: string,
  id: string,
): Promise<void> {
  try {
    await client.deleteCronJob({ namespace, name: id });
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
