import type { Handlers } from "@vyft/core";
import type { VolumeInput } from "@vyft/runtime";
import type { DockerClient } from "./client.ts";
import type { DockerContext } from "./context.ts";

function volumeName(project: string, stage: string, id: string): string {
  return `vyft-${project}-${stage}-${id}`;
}

export async function createVolume(
  client: DockerClient,
  name: string,
): Promise<void> {
  const res = await client.post("/volumes/create", {
    Name: name,
    Driver: "local",
  });
  if (res.status !== 201) {
    throw new Error(`Failed to create volume ${name}: ${res.status}`);
  }
}

export async function removeVolume(
  client: DockerClient,
  name: string,
): Promise<void> {
  await client.del(`/volumes/${name}`);
}

export const volumeHandlers: Handlers<VolumeInput, DockerContext> = {
  async create({ input, ctx }) {
    const name = volumeName(ctx.project, ctx.stage, input.name);
    await createVolume(ctx.client, name);
    return { output: { name } };
  },

  async read({ input, ctx }) {
    const name = volumeName(ctx.project, ctx.stage, input.name);
    const res = await ctx.client.get(`/volumes/${name}`);
    if (res.status !== 200) return {};
    return { name };
  },

  async delete({ input, ctx }) {
    const name = volumeName(ctx.project, ctx.stage, input.name);
    await removeVolume(ctx.client, name);
  },

  async diff() {
    return { action: "none" };
  },
};
