import type { BindMount, CronJobConfig, EnvValue } from "@vyft/primitives";
import { durationToNanos } from "../duration.ts";
import { resolveEnv } from "../resolve.ts";
import type { SwarmServiceSpec } from "./service.ts";

/** Build a Swarm service spec for a cronjob scheduler container. */
export function buildCronServiceSpec(
  serviceName: string,
  id: string,
  cronImage: string,
  config: CronJobConfig,
  networkId: string,
  secrets: ReadonlyMap<string, string>,
  project?: string,
): SwarmServiceSpec {
  const env = config.env
    ? resolveEnv(config.env as Record<string, EnvValue>, secrets)
    : {};
  const envArr = Object.entries(env).map(([k, v]) => `${k}=${v}`);

  const mounts = config.mounts?.map((m) => {
    if (m.source.kind === "bind") {
      return {
        Type: "bind",
        Source: (m.source as BindMount).hostPath,
        Target: m.path,
      };
    }
    const name = project ? `vyft-${project}-${m.source.id}` : m.source.id;
    return { Type: "volume", Source: name, Target: m.path };
  });

  const stackNs = project ? `vyft-${project}` : serviceName;

  const containerSpec: SwarmServiceSpec["TaskTemplate"]["ContainerSpec"] = {
    Image: cronImage,
  };
  if (envArr.length > 0) containerSpec.Env = envArr;
  if (mounts?.length) containerSpec.Mounts = mounts;

  if (config.health) {
    const hc: Record<string, unknown> = {
      Test: ["CMD-SHELL", config.health.command],
    };
    if (config.health.interval)
      hc["Interval"] = durationToNanos(config.health.interval);
    if (config.health.timeout)
      hc["Timeout"] = durationToNanos(config.health.timeout);
    if (config.health.retries !== undefined)
      hc["Retries"] = config.health.retries;
    if (config.health.startPeriod)
      hc["StartPeriod"] = durationToNanos(config.health.startPeriod);
    containerSpec.Healthcheck = hc;
  }

  return {
    Name: serviceName,
    Labels: { "com.docker.stack.namespace": stackNs },
    TaskTemplate: {
      ContainerSpec: containerSpec,
      RestartPolicy: { Condition: "any" },
      Networks: [{ Target: networkId, Aliases: [id] }],
    },
    Mode: { Replicated: { Replicas: 1 } },
    EndpointSpec: {},
  };
}
