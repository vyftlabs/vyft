import type { Handlers } from "@vyft/core";
import type { ServiceInput } from "@vyft/runtime";
import {
  buildContainerConfig,
  containerName,
  createContainer,
  recreateContainer,
  removeContainer,
} from "./container.ts";
import type { DockerContext } from "./context.ts";
import { inspectContainer, normalizeDockerContainer } from "./inspect.ts";
import { ensureNetwork } from "./network.ts";

export const serviceHandlers: Handlers<ServiceInput, DockerContext> = {
  async create({ input, ctx }) {
    await ensureNetwork(ctx.client, ctx.networkName);

    const name = containerName(ctx.project, ctx.stage, input.image ?? "app");
    const image = input.image ?? "node:lts-slim";
    const config = buildContainerConfig(input, name, image, ctx);
    const containerId = await createContainer(ctx.client, name, config);

    return {
      output: {
        host: name,
        port: input.port,
        url: `http://${name}:${input.port}`,
        containerId,
      },
    };
  },

  async read({ input, ctx }) {
    const name = containerName(ctx.project, ctx.stage, input.image ?? "app");
    const inspect = await inspectContainer(ctx.client, name);
    if (!inspect) return {};
    const normalized = normalizeDockerContainer(inspect);
    return {
      ...normalized,
      host: name,
      port: input.port,
      url: `http://${name}:${input.port}`,
      containerId: inspect.Id,
    };
  },

  async update({ input, ctx }) {
    await ensureNetwork(ctx.client, ctx.networkName);

    const name = containerName(ctx.project, ctx.stage, input.image ?? "app");
    const image = input.image ?? "node:lts-slim";
    const config = buildContainerConfig(input, name, image, ctx);
    const containerId = await recreateContainer(ctx.client, name, config);

    return {
      host: name,
      port: input.port,
      url: `http://${name}:${input.port}`,
      containerId,
    };
  },

  async delete({ input, ctx }) {
    const name = containerName(ctx.project, ctx.stage, input.image ?? "app");
    await removeContainer(ctx.client, name);
  },

  async diff() {
    return { action: "recreate" };
  },
};
