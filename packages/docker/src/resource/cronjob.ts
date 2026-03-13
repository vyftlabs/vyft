import type { Handlers } from "@vyft/core";
import type { CronJobInput } from "@vyft/runtime";
import {
  buildContainerConfig,
  containerName,
  createContainer,
  recreateContainer,
  removeContainer,
} from "../client/container.ts";
import { pullImage } from "../client/image.ts";
import { inspectContainer } from "../client/inspect.ts";
import type { DockerContext } from "../context.ts";

function buildCronCommand(schedule: string, command: string[]): string[] {
  const crontab = `${schedule} ${command.join(" ")}`;
  return [
    "sh",
    "-c",
    `echo '${crontab}' > /tmp/crontab && supercronic /tmp/crontab`,
  ];
}

export const cronjobHandlers: Handlers<CronJobInput, DockerContext> = {
  async create({ input, ctx }) {
    const name = containerName(ctx.project, ctx.stage, input.name);
    const image = input.image ?? "node:lts-slim";
    await pullImage(ctx.client, image);

    const serviceInput = {
      image,
      path: input.path,
      cwd: input.cwd,
      port: 0,
      env: input.env,
      command: input.command
        ? buildCronCommand(input.schedule, input.command)
        : undefined,
      mounts: input.mounts,
      health: input.health,
      restart: input.restart ?? ("on-failure" as const),
    };

    const config = buildContainerConfig(serviceInput, name, image, ctx);
    const containerId = await createContainer(ctx.client, name, config);

    return {
      output: {
        name,
        containerId,
      },
    };
  },

  async read({ input, ctx }) {
    const name = containerName(ctx.project, ctx.stage, input.name);
    const inspect = await inspectContainer(ctx.client, name);
    if (!inspect) return {};
    return { name, containerId: inspect.Id };
  },

  async update({ input, ctx }) {
    const name = containerName(ctx.project, ctx.stage, input.name);
    const image = input.image ?? "node:lts-slim";

    const serviceInput = {
      image,
      path: input.path,
      cwd: input.cwd,
      port: 0,
      env: input.env,
      command: input.command
        ? buildCronCommand(input.schedule, input.command)
        : undefined,
      mounts: input.mounts,
      health: input.health,
      restart: input.restart ?? ("on-failure" as const),
    };

    const config = buildContainerConfig(serviceInput, name, image, ctx);
    const containerId = await recreateContainer(ctx.client, name, config);

    return {
      name,
      containerId,
    };
  },

  async delete({ input, ctx }) {
    const name = containerName(ctx.project, ctx.stage, input.name);
    await removeContainer(ctx.client, name);
  },
};
