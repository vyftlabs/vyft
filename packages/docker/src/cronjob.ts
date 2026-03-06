import type { Handlers } from "@vyft/core";
import type { CronJobInput } from "@vyft/runtime";
import {
  buildContainerConfig,
  containerName,
  createContainer,
  recreateContainer,
  removeContainer,
} from "./container.ts";
import type { DockerContext } from "./context.ts";
import { ensureNetwork } from "./network.ts";

function buildCronCommand(schedule: string, command: string[]): string[] {
  // Use supercronic-style wrapper: write crontab, run supercronic
  const crontab = `${schedule} ${command.join(" ")}`;
  return [
    "sh",
    "-c",
    `echo '${crontab}' > /tmp/crontab && supercronic /tmp/crontab`,
  ];
}

export const cronjobHandlers: Handlers<CronJobInput, DockerContext> = {
  async create({ input, ctx }) {
    await ensureNetwork(ctx.client, ctx.networkName);

    const name = containerName(
      ctx.project,
      ctx.stage,
      `cron-${input.schedule.replace(/\s+/g, "-")}`,
    );
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
    const containerId = await createContainer(ctx.client, name, config);

    return {
      output: {
        name,
        containerId,
      },
    };
  },

  async update({ input, ctx }) {
    await ensureNetwork(ctx.client, ctx.networkName);

    const name = containerName(
      ctx.project,
      ctx.stage,
      `cron-${input.schedule.replace(/\s+/g, "-")}`,
    );
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
    const name = containerName(
      ctx.project,
      ctx.stage,
      `cron-${input.schedule.replace(/\s+/g, "-")}`,
    );
    await removeContainer(ctx.client, name);
  },

  async diff() {
    return { action: "recreate" };
  },
};
