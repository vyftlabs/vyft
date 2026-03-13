import type { Handlers } from "@vyft/core";
import type { ServiceInput } from "@vyft/runtime";
import {
  buildContainerConfig,
  containerName,
  createContainer,
  recreateContainer,
  removeContainer,
} from "../client/container.ts";
import { pullImage } from "../client/image.ts";
import {
  inspectContainer,
  normalizeDockerContainer,
} from "../client/inspect.ts";
import type { DockerContext } from "../context.ts";

async function resolveImage(
  input: ServiceInput,
  ctx: DockerContext,
): Promise<string> {
  if (!input.image) {
    throw new Error(
      `Service "${input.name}" requires an image`,
    );
  }
  // Check if image exists locally (e.g. build-produced); pull only if not found
  const inspectRes = await ctx.client.get(
    `/images/${encodeURIComponent(input.image)}/json`,
  );
  if (inspectRes.status !== 200) {
    await pullImage(ctx.client, input.image);
  }
  return input.image;
}

export const serviceHandlers: Handlers<ServiceInput, DockerContext> = {
  async create({ input, ctx }) {
    const name = containerName(ctx.project, ctx.stage, input.name);
    const image = await resolveImage(input, ctx);
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
    const name = containerName(ctx.project, ctx.stage, input.name);
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
    const name = containerName(ctx.project, ctx.stage, input.name);
    const image = await resolveImage(input, ctx);
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
    const name = containerName(ctx.project, ctx.stage, input.name);
    await removeContainer(ctx.client, name);
  },
};
