import type { DockerClient } from "./index.ts";

interface ContainerInput {
  port: number;
  env?: Record<string, string> | undefined;
  command?: string[] | undefined;
  mounts?: Array<{ source: string; target: string }> | undefined;
  health?:
    | {
        path: string;
        interval?: string | undefined;
        timeout?: string | undefined;
        retries?: number | undefined;
      }
    | undefined;
  restart?: string | undefined;
}

export function containerName(
  project: string,
  stage: string,
  id: string,
): string {
  return `vyft-${project}-${stage}-${id}`;
}

interface HostConfig {
  RestartPolicy: { Name: string };
  NetworkMode: string;
  Binds?: string[];
}

interface ContainerConfig {
  Image: string;
  Env: string[];
  ExposedPorts: Record<string, object>;
  HostConfig: HostConfig;
  Labels: Record<string, string>;
  Cmd?: string[];
  Healthcheck?: {
    Test: string[];
    Interval?: number;
    Timeout?: number;
    Retries?: number;
  };
}

export function buildContainerConfig(
  input: ContainerInput,
  name: string,
  image: string,
  ctx: { project: string; stage: string; networkName: string },
): ContainerConfig {
  const env = Object.entries(input.env ?? {}).map(([k, v]) => `${k}=${v}`);

  const labels: Record<string, string> = {
    "com.docker.compose.project": ctx.project,
    "com.docker.compose.service": name,
    "vyft.project": ctx.project,
    "vyft.stage": ctx.stage,
    "vyft.managed": "true",
  };

  const config: ContainerConfig = {
    Image: image,
    Env: env,
    ExposedPorts: { [`${input.port}/tcp`]: {} },
    HostConfig: {
      RestartPolicy: { Name: input.restart ?? "always" },
      NetworkMode: ctx.networkName,
    },
    Labels: labels,
  };

  if (input.command) {
    config.Cmd = input.command;
  }

  if (input.mounts && input.mounts.length > 0) {
    config.HostConfig.Binds = input.mounts.map(
      (m) => `${m.source}:${m.target}`,
    );
  }

  if (input.health) {
    config.Healthcheck = {
      Test: [
        "CMD-SHELL",
        `curl -f http://localhost:${input.port}${input.health.path} || exit 1`,
      ],
    };
    if (input.health.retries !== undefined) {
      config.Healthcheck.Retries = input.health.retries;
    }
  }

  return config;
}

interface CreateContainerResponse {
  Id: string;
}

export async function createContainer(
  client: DockerClient,
  name: string,
  config: ContainerConfig,
): Promise<string> {
  let res = await client.post<CreateContainerResponse>(
    `/containers/create?name=${encodeURIComponent(name)}`,
    config,
  );

  if (res.status === 409) {
    await removeContainer(client, name);
    res = await client.post<CreateContainerResponse>(
      `/containers/create?name=${encodeURIComponent(name)}`,
      config,
    );
  }

  if (res.status !== 201) {
    throw new Error(`Failed to create container ${name}: ${res.status}`);
  }

  await client.post(`/containers/${res.body.Id}/start`);
  return res.body.Id;
}

export async function removeContainer(
  client: DockerClient,
  name: string,
): Promise<void> {
  await client.post(`/containers/${name}/stop`).catch(() => {});
  await client.del(`/containers/${name}?force=true`);
}

export async function recreateContainer(
  client: DockerClient,
  name: string,
  config: ContainerConfig,
): Promise<string> {
  await removeContainer(client, name);
  return createContainer(client, name, config);
}
