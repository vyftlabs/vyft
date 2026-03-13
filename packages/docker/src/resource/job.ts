import {
  buildContainerConfig,
  containerName,
  createContainer,
  recreateContainer,
  removeContainer,
} from "../client/container.ts";
import { pullImage } from "../client/image.ts";
import { docker } from "../runtime.ts";

export const jobHandlers = docker.job({
  async create({ input, ctx }) {
    const name = containerName(ctx.project, ctx.stage, input.name);
    const image = input.image ?? "node:lts-slim";
    await pullImage(ctx.client, image);

    const config = buildContainerConfig(
      {
        port: 0,
        env: input.env,
        command: input.command,
        mounts: input.mounts,
        restart: "no",
      },
      name,
      image,
      ctx,
    );
    const containerId = await createContainer(ctx.client, name, config);

    // Wait for the container to finish
    const res = await ctx.client.post<{ StatusCode: number }>(
      `/containers/${containerId}/wait`,
    );

    return {
      output: {
        name,
        exitCode: res.body.StatusCode,
        containerId,
      },
    };
  },

  async update({ input, ctx }) {
    const name = containerName(ctx.project, ctx.stage, input.name);
    const image = input.image ?? "node:lts-slim";
    await pullImage(ctx.client, image);

    const config = buildContainerConfig(
      {
        port: 0,
        env: input.env,
        command: input.command,
        mounts: input.mounts,
        restart: "no",
      },
      name,
      image,
      ctx,
    );
    const containerId = await recreateContainer(ctx.client, name, config);

    const res = await ctx.client.post<{ StatusCode: number }>(
      `/containers/${containerId}/wait`,
    );

    return {
      name,
      exitCode: res.body.StatusCode,
      containerId,
    };
  },

  async delete({ input, ctx }) {
    const name = containerName(ctx.project, ctx.stage, input.name);
    await removeContainer(ctx.client, name);
  },
});
