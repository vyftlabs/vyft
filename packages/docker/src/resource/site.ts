import type { Handlers } from "@vyft/core";
import type { SiteArgs } from "@vyft/platform";
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

type SiteInput = SiteArgs & { name: string };

const DEFAULT_PORT = 80;
const IMAGE = "nginx:alpine";

function labels(ctx: DockerContext, name: string): Record<string, string> {
  return {
    "vyft.project": ctx.project,
    "vyft.stage": ctx.stage,
    "vyft.managed": "true",
    "vyft.resource": name,
  };
}

export const siteHandlers: Handlers<SiteInput, DockerContext> = {
  async create({ input, ctx }) {
    await ensureNetwork(ctx.client, ctx.networkName);

    const name = containerName(ctx.project, ctx.stage, input.name);
    await pullImage(ctx.client, IMAGE);

    const containerId = await createContainer(ctx.client, name, {
      Image: IMAGE,
      Env: [],
      ExposedPorts: { [`${DEFAULT_PORT}/tcp`]: {} },
      HostConfig: {
        RestartPolicy: { Name: "always" },
        NetworkMode: ctx.networkName,
        Binds: input.path ? [`${input.path}:/usr/share/nginx/html:ro`] : [],
      },
      Labels: labels(ctx, name),
    });

    return {
      output: {
        host: name,
        port: DEFAULT_PORT,
        url: `http://${name}:${DEFAULT_PORT}`,
        domain: input.domain,
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
      url: `http://${name}:${DEFAULT_PORT}`,
      domain: input.domain,
      containerId: inspect.Id,
    };
  },

  async update({ input, ctx }) {
    await ensureNetwork(ctx.client, ctx.networkName);

    const name = containerName(ctx.project, ctx.stage, input.name);
    await pullImage(ctx.client, IMAGE);

    const containerId = await recreateContainer(ctx.client, name, {
      Image: IMAGE,
      Env: [],
      ExposedPorts: { [`${DEFAULT_PORT}/tcp`]: {} },
      HostConfig: {
        RestartPolicy: { Name: "always" },
        NetworkMode: ctx.networkName,
        Binds: input.path ? [`${input.path}:/usr/share/nginx/html:ro`] : [],
      },
      Labels: labels(ctx, name),
    });

    return {
      host: name,
      port: DEFAULT_PORT,
      url: `http://${name}:${DEFAULT_PORT}`,
      domain: input.domain,
      containerId,
    };
  },

  async delete({ input, ctx }) {
    const name = containerName(ctx.project, ctx.stage, input.name);
    await removeContainer(ctx.client, name);
  },
};
