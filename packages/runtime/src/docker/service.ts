import { logger } from "@vyft/logger";
import type {
  BindMount,
  BuildConfig,
  EnvValue,
  HealthCheck,
  ServiceConfig,
} from "@vyft/primitives";
import { durationToNanos } from "../duration.ts";
import { resolveEnv } from "../resolve.ts";

const log = logger.child("docker");

import type { DockerClient } from "./client.ts";

export interface ContainerConfig {
  Image: string;
  Env: string[];
  Cmd?: string[];
  Labels?: Record<string, string>;
  Healthcheck?: Record<string, unknown>;
  ExposedPorts?: Record<string, Record<string, never>>;
  HostConfig: {
    Binds: string[];
    NetworkMode: string;
    RestartPolicy: { Name: string; MaximumRetryCount: number };
    PortBindings?: Record<string, { HostPort: string }[]>;
  };
  NetworkingConfig: {
    EndpointsConfig: Record<string, { Aliases: string[] }>;
  };
}

/** Build a Docker container config from a ServiceConfig. */
export function buildContainerConfig(
  id: string,
  config: ServiceConfig,
  networkName: string,
  secrets: ReadonlyMap<string, string>,
  project?: string,
  stage?: string,
  portBindings?: Map<number, number>,
): ContainerConfig {
  const image = config.image ?? `vyft-build-${id}:latest`;
  const env = config.env
    ? resolveEnv(config.env as Record<string, EnvValue>, secrets)
    : {};
  const envArr = Object.entries(env).map(([k, v]) => `${k}=${v}`);

  const binds: string[] = [];
  if (config.mounts) {
    for (const m of config.mounts) {
      if (m.source.kind === "bind") {
        binds.push(`${(m.source as BindMount).hostPath}:${m.path}`);
      } else {
        // Volume name must match the runtime's volumeName() function
        const src =
          project && stage
            ? `vyft-${project}-${stage}-${m.source.id}`
            : project
              ? `vyft-${project}-${m.source.id}`
              : m.source.id;
        binds.push(`${src}:${m.path}`);
      }
    }
  }

  const restartPolicy = config.restart ?? "always";
  const restartMap: Record<
    string,
    { Name: string; MaximumRetryCount: number }
  > = {
    none: { Name: "", MaximumRetryCount: 0 },
    "on-failure": { Name: "on-failure", MaximumRetryCount: 5 },
    always: { Name: "always", MaximumRetryCount: 0 },
  };

  const composeProject = project ? `vyft-${project}` : id;

  const cc: ContainerConfig = {
    Image: image,
    Env: envArr,
    Labels: {
      "com.docker.compose.project": composeProject,
      "com.docker.compose.service": id,
      "com.docker.compose.container-number": "1",
      "com.docker.compose.oneoff": "False",
    },
    HostConfig: {
      Binds: binds,
      NetworkMode: networkName,
      RestartPolicy: restartMap[restartPolicy] ?? {
        Name: "always",
        MaximumRetryCount: 0,
      },
    },
    NetworkingConfig: {
      EndpointsConfig: {
        [networkName]: { Aliases: [id] },
      },
    },
  };

  if (portBindings && portBindings.size > 0) {
    cc.ExposedPorts = {};
    cc.HostConfig.PortBindings = {};
    for (const [container, host] of portBindings) {
      const key = `${container}/tcp`;
      cc.ExposedPorts[key] = {};
      cc.HostConfig.PortBindings[key] = [{ HostPort: String(host) }];
    }
  }

  if (config.command) {
    cc.Cmd = Array.isArray(config.command)
      ? config.command
      : ["sh", "-c", config.command];
  }

  if (config.health) {
    cc.Healthcheck = buildHealthcheck(config.health);
  }

  return cc;
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

/** Create and start a container. Builds image if `build` is set. */
export async function createContainer(
  client: DockerClient,
  containerName: string,
  id: string,
  config: ServiceConfig,
  networkName: string,
  secrets: ReadonlyMap<string, string>,
  project?: string,
  stage?: string,
  portBindings?: Map<number, number>,
  imageUtils?: {
    buildImage?: (tag: string, build: BuildConfig) => Promise<unknown>;
    pullImage?: (image: string) => Promise<void>;
  },
): Promise<string> {
  if (config.build) {
    const tag = `vyft-build-${id}:latest`;
    await imageUtils?.buildImage?.(tag, config.build);
  } else if (config.image) {
    await imageUtils?.pullImage?.(config.image);
  }

  const cc = buildContainerConfig(
    id,
    config,
    networkName,
    secrets,
    project,
    stage,
    portBindings,
  );
  let result = (await client.post(
    `/containers/create?name=${encodeURIComponent(containerName)}`,
    cc,
  )) as { Id?: string };

  if (!result?.Id) {
    // 409 Conflict — container already exists; try starting it
    try {
      await client.post(`/containers/${containerName}/start`);
      const info = (await client.get(`/containers/${containerName}/json`)) as {
        Id: string;
      };
      return info.Id;
    } catch {
      // Can't start — remove and recreate
      await removeContainer(client, containerName);
      result = (await client.post(
        `/containers/create?name=${encodeURIComponent(containerName)}`,
        cc,
      )) as { Id: string };
    }
  }

  await client.post(`/containers/${result.Id}/start`);
  return result.Id as string;
}

/** Stop and remove a container. Ignores 404/304/409 (already stopped/removed/in progress). */
export async function removeContainer(
  client: DockerClient,
  containerName: string,
): Promise<void> {
  try {
    await client.post(`/containers/${containerName}/stop?t=10`);
  } catch {
    // Already stopped or doesn't exist
  }
  try {
    await client.del(`/containers/${containerName}?force=true`);
  } catch (err) {
    // Ignore 404 (not found) and 409 (removal already in progress)
    const msg = String(err);
    if (!msg.includes("404") && !msg.includes("409")) {
      throw err;
    }
  }
}

/** Recreate a container: stop, remove, create new one. */
export async function recreateContainer(
  client: DockerClient,
  containerName: string,
  id: string,
  config: ServiceConfig,
  networkName: string,
  secrets: ReadonlyMap<string, string>,
  project?: string,
  stage?: string,
  portBindings?: Map<number, number>,
  imageUtils?: {
    buildImage?: (tag: string, build: BuildConfig) => Promise<unknown>;
    pullImage?: (image: string) => Promise<void>;
  },
): Promise<string> {
  await removeContainer(client, containerName);
  return createContainer(
    client,
    containerName,
    id,
    config,
    networkName,
    secrets,
    project,
    stage,
    portBindings,
    imageUtils,
  );
}

/** Warn if replicas > 1, since Docker runtime only runs single containers. */
export function warnReplicas(id: string, config: ServiceConfig): void {
  const replicas = config.replicas ?? 1;
  if (replicas > 1) {
    log.warn(
      `Service "${id}" has replicas=${replicas}, but Docker runtime runs a single container. Use Swarm or another runtime for scaling.`,
    );
  }
}
