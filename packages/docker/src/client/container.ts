import { durationToNanos } from "@vyft/runtime";
import type { DockerClient } from "./index.ts";

interface ContainerInput {
  port: number;
  domain?: string | undefined;
  env?: Record<string, string> | undefined;
  command?: string[] | undefined;
  mounts?: Array<{ source: string; target: string }> | undefined;
  health?:
    | {
        path?: string | undefined;
        command?: string | undefined;
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
  PortBindings?: Record<string, Array<{ HostPort: string }>>;
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
  ctx: {
    project: string;
    stage: string;
    networkName: string;
    publishPorts?: boolean;
  },
): ContainerConfig {
  const baseEnv = { NODE_ENV: ctx.stage, ...input.env };
  const env = Object.entries(baseEnv).map(([k, v]) => `${k}=${v}`);

  const labels: Record<string, string> = {
    "com.docker.compose.project": ctx.project,
    "com.docker.compose.service": name,
    "vyft.project": ctx.project,
    "vyft.stage": ctx.stage,
    "vyft.managed": "true",
  };

  if (input.domain) {
    labels["caddy"] = input.domain;
    labels["caddy.reverse_proxy"] = `{{upstreams ${input.port}}}`;
  }

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

  if (ctx.publishPorts) {
    config.HostConfig.PortBindings = {
      [`${input.port}/tcp`]: [{ HostPort: String(input.port) }],
    };
  }

  if (input.command) {
    config.Cmd = input.command;
  }

  if (input.mounts && input.mounts.length > 0) {
    config.HostConfig.Binds = input.mounts.map(
      (m) => `${m.source}:${m.target}`,
    );
  }

  if (input.health) {
    const test = input.health.command
      ? ["CMD-SHELL", input.health.command]
      : [
          "CMD-SHELL",
          `node -e "require('http').get('http://localhost:${input.port}${input.health.path}',r=>{r.statusCode===200?process.exit(0):process.exit(1)}).on('error',()=>process.exit(1))"`,
        ];
    config.Healthcheck = {
      Test: test,
    };
    if (input.health.interval !== undefined) {
      config.Healthcheck.Interval = durationToNanos(input.health.interval);
    }
    if (input.health.timeout !== undefined) {
      config.Healthcheck.Timeout = durationToNanos(input.health.timeout);
    }
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
  const res = await client.del(`/containers/${name}?force=true`);
  if (res.status !== 204 && res.status !== 404) {
    throw new Error(`Failed to remove container ${name}: ${res.status}`);
  }
}

export async function recreateContainer(
  client: DockerClient,
  name: string,
  config: ContainerConfig,
): Promise<string> {
  await removeContainer(client, name);
  return createContainer(client, name, config);
}
