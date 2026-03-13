import { createVolume, removeVolume } from "../client/volume.ts";
import { docker } from "../runtime.ts";

function volumeName(project: string, stage: string, id: string): string {
  return `vyft-${project}-${stage}-${id}`;
}

export const volumeHandlers = docker.volume({
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
});
