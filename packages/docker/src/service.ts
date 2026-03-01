import type { EnvValue, HealthCheck, ServiceConfig } from "@vyft/core";
import { buildImage, durationToNanos, pullImage, resolveEnv } from "@vyft/core";
import * as log from "@vyft/core/logger";
import type { DockerClient } from "./client.ts";

export interface ContainerConfig {
  Image: string;
  Env: string[];
  Cmd?: string[];
  Labels?: Record<string, string>;
  Healthcheck?: Record<string, unknown>;
  HostConfig: {
    Binds: string[];
    NetworkMode: string;
    RestartPolicy: { Name: string; MaximumRetryCount: number };
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
): ContainerConfig {
  const image = config.image ?? `vyft-build-${id}:latest`;
  const env = config.env
    ? resolveEnv(config.env as Record<string, EnvValue>, secrets)
    : {};
  const envArr = Object.entries(env).map(([k, v]) => `${k}=${v}`);

  const binds: string[] = [];
  if (config.mounts) {
    for (const m of config.mounts) {
      const src = project ? `vyft-${project}-${m.volume.id}` : m.volume.id;
      binds.push(`${src}:${m.path}`);
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
): Promise<string> {
  if (config.build) {
    const tag = `vyft-build-${id}:latest`;
    await buildImage(tag, config.build);
  } else if (config.image) {
    await pullImage(config.image);
  }

  const cc = buildContainerConfig(id, config, networkName, secrets, project);
  const result = (await client.post(
    `/containers/create?name=${encodeURIComponent(containerName)}`,
    cc,
  )) as { Id: string };

  await client.post(`/containers/${result.Id}/start`);
  return result.Id;
}

/** Stop and remove a container. Ignores 404/304 (already stopped/removed). */
export async function removeContainer(
  client: DockerClient,
  containerName: string,
): Promise<void> {
  try {
    await client.post(`/containers/${containerName}/stop?t=10`);
  } catch {
    // Already stopped or doesn't exist
  }
  await client.del(`/containers/${containerName}?force=true`);
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
