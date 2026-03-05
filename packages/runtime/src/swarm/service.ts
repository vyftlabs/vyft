import type {
  BindMount,
  EnvValue,
  HealthCheck,
  ServiceConfig,
} from "@vyft/primitives";
import type { DockerClient } from "../docker/client.ts";
import { durationToNanos } from "../duration.ts";
import { resolveEnv } from "../resolve.ts";

export interface SwarmServiceSpec {
  Name: string;
  Labels: Record<string, string>;
  TaskTemplate: {
    ContainerSpec: {
      Image: string;
      Env?: string[];
      Command?: string[];
      Mounts?: { Type: string; Source: string; Target: string }[];
      Healthcheck?: Record<string, unknown>;
    };
    RestartPolicy: { Condition: string; MaxAttempts?: number };
    Networks: { Target: string; Aliases: string[] }[];
  };
  Mode: { Replicated: { Replicas: number } };
  EndpointSpec: { Ports?: { TargetPort: number; PublishedPort?: number }[] };
  UpdateConfig?: {
    Parallelism: number;
    Delay: number;
    FailureAction: "continue" | "pause" | "rollback";
    Monitor: number;
    MaxFailureRatio: number;
  };
}

/** Build a Swarm service spec from config. */
export function buildServiceSpec(
  serviceName: string,
  id: string,
  config: ServiceConfig,
  networkId: string,
  secrets: ReadonlyMap<string, string>,
  project?: string,
): SwarmServiceSpec {
  const image = config.image ?? `127.0.0.1:5000/vyft-${id}:latest`;
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

  const restartMap: Record<
    string,
    { Condition: string; MaxAttempts?: number }
  > = {
    none: { Condition: "none" },
    "on-failure": { Condition: "on-failure", MaxAttempts: 5 },
    always: { Condition: "any" },
  };

  const containerSpec: SwarmServiceSpec["TaskTemplate"]["ContainerSpec"] = {
    Image: image,
  };
  if (envArr.length > 0) containerSpec.Env = envArr;
  if (mounts?.length) containerSpec.Mounts = mounts;

  const stackNs = project ? `vyft-${project}` : serviceName;

  const spec: SwarmServiceSpec = {
    Name: serviceName,
    Labels: { "com.docker.stack.namespace": stackNs },
    TaskTemplate: {
      ContainerSpec: containerSpec,
      RestartPolicy: restartMap[config.restart ?? "always"] ?? {
        Condition: "any",
      },
      Networks: [{ Target: networkId, Aliases: [id] }],
    },
    Mode: { Replicated: { Replicas: config.replicas ?? 1 } },
    EndpointSpec: {},
    UpdateConfig: {
      Parallelism: 1,
      Delay: 5_000_000_000,
      FailureAction: "rollback",
      Monitor: 5_000_000_000,
      MaxFailureRatio: 0,
    },
  };

  if (config.command) {
    spec.TaskTemplate.ContainerSpec.Command = Array.isArray(config.command)
      ? config.command
      : ["sh", "-c", config.command];
  }

  if (config.health) {
    spec.TaskTemplate.ContainerSpec.Healthcheck = buildHealthcheck(
      config.health,
    );
  }

  return spec;
}

function buildHealthcheck(health: HealthCheck): Record<string, unknown> {
  const hc: Record<string, unknown> = {
    Test: ["CMD-SHELL", health.command],
  };
  if (health.interval) hc["Interval"] = durationToNanos(health.interval);
  if (health.timeout) hc["Timeout"] = durationToNanos(health.timeout);
  if (health.retries !== undefined) hc["Retries"] = health.retries;
  if (health.startPeriod)
    hc["StartPeriod"] = durationToNanos(health.startPeriod);
  return hc;
}

interface SwarmServiceInfo {
  ID: string;
  Version: { Index: number };
}

/** Create a Swarm service. */
export async function createSwarmService(
  client: DockerClient,
  spec: SwarmServiceSpec,
): Promise<string> {
  const result = (await client.post("/services/create", spec)) as {
    ID: string;
  };
  return result.ID;
}

/** Update a Swarm service in-place (rolling update). */
export async function updateSwarmService(
  client: DockerClient,
  serviceName: string,
  spec: SwarmServiceSpec,
): Promise<void> {
  const services = (await client.get(
    `/services?filters=${encodeURIComponent(JSON.stringify({ name: [serviceName] }))}`,
  )) as SwarmServiceInfo[];

  const svc = services[0];
  if (!svc)
    throw new Error(`Swarm service "${serviceName}" not found for update`);

  await client.post(
    `/services/${svc.ID}/update?version=${svc.Version.Index}`,
    spec,
  );
}

/** Remove a Swarm service. */
export async function removeSwarmService(
  client: DockerClient,
  serviceName: string,
): Promise<void> {
  await client.del(`/services/${serviceName}`);
}
