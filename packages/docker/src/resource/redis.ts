import type { Handlers } from "@vyft/core";
import type { RedisArgs } from "@vyft/platform";
import {
  containerName,
  createContainer,
  recreateContainer,
  removeContainer,
} from "../client/container.ts";
import { pullImage } from "../client/image.ts";
import { inspectContainer } from "../client/inspect.ts";
import { ensureNetwork } from "../client/network.ts";
import type { DockerContext } from "../context.ts";

type RedisInput = RedisArgs & { name: string };

const DEFAULT_PORT = 6379;

function image(version?: string): string {
  return `redis:${version ?? "7"}`;
}

function labels(ctx: DockerContext, name: string): Record<string, string> {
  return {
    "vyft.project": ctx.project,
    "vyft.stage": ctx.stage,
    "vyft.managed": "true",
    "vyft.resource": name,
  };
}

export const redisHandlers: Handlers<RedisInput, DockerContext> = {
  async create({ input, ctx }) {
    await ensureNetwork(ctx.client, ctx.networkName);

    const name = containerName(ctx.project, ctx.stage, input.name);
    const img = image(input.version);
    await pullImage(ctx.client, img);

    const containerId = await createContainer(ctx.client, name, {
      Image: img,
      Env: [],
      ExposedPorts: { [`${DEFAULT_PORT}/tcp`]: {} },
      HostConfig: {
        RestartPolicy: { Name: "always" },
        NetworkMode: ctx.networkName,
      },
      Labels: labels(ctx, name),
    });

    return {
      output: {
        host: name,
        port: DEFAULT_PORT,
        url: `redis://${name}:${DEFAULT_PORT}`,
        containerId,
      },
    };
  },

  async read({ input, ctx }) {
    const name = containerName(ctx.project, ctx.stage, input.name);
    const inspect = await inspectContainer(ctx.client, name);
    if (!inspect) return {};
    return {
      host: name,
      port: DEFAULT_PORT,
      url: `redis://${name}:${DEFAULT_PORT}`,
      containerId: inspect.Id,
    };
  },

  async update({ input, ctx }) {
    await ensureNetwork(ctx.client, ctx.networkName);

    const name = containerName(ctx.project, ctx.stage, input.name);
    const img = image(input.version);
    await pullImage(ctx.client, img);

    const containerId = await recreateContainer(ctx.client, name, {
      Image: img,
      Env: [],
      ExposedPorts: { [`${DEFAULT_PORT}/tcp`]: {} },
      HostConfig: {
        RestartPolicy: { Name: "always" },
        NetworkMode: ctx.networkName,
      },
      Labels: labels(ctx, name),
    });

    return {
      host: name,
      port: DEFAULT_PORT,
      url: `redis://${name}:${DEFAULT_PORT}`,
      containerId,
    };
  },

  async delete({ input, ctx }) {
    const name = containerName(ctx.project, ctx.stage, input.name);
    await removeContainer(ctx.client, name);
  },
};
