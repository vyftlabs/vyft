import path from "node:path";
import type { Handlers } from "@vyft/core";
import { build, info } from "@vyft/railpack";
import type { BuildInput } from "@vyft/runtime";
import type { DockerContext } from "../context.ts";

function buildImageName(project: string, stage: string, id: string): string {
  return `vyft-build-${project}-${id}:${stage}`;
}

async function resolveStartCommand(
  buildDir: string,
  entryPath: string,
  explicit?: string,
): Promise<string> {
  if (explicit) return explicit;
  const detected = await info(buildDir);
  const metadata = (detected["metadata"] ?? {}) as Record<string, string>;
  const runtime = metadata["nodeRuntime"] ?? "node";
  return `${runtime} ${entryPath}`;
}

export const buildHandlers: Handlers<BuildInput, DockerContext> = {
  async create({ input, ctx }) {
    const tag = buildImageName(ctx.project, ctx.stage, input.name);
    const buildDir = path.resolve(process.cwd(), input.cwd ?? ".");
    const startCommand = await resolveStartCommand(buildDir, input.path, input.start);
    await build(buildDir, {
      name: tag,
      progress: "plain",
      startCommand,
    });
    return { output: { image: tag } };
  },

  async read({ input, ctx }) {
    const tag = buildImageName(ctx.project, ctx.stage, input.name);
    const res = await ctx.client.get(`/images/${encodeURIComponent(tag)}/json`);
    if (res.status !== 200) return {};
    return { image: tag };
  },

  async update({ input, ctx }) {
    const tag = buildImageName(ctx.project, ctx.stage, input.name);
    const buildDir = path.resolve(process.cwd(), input.cwd ?? ".");
    const startCommand = await resolveStartCommand(buildDir, input.path, input.start);
    await build(buildDir, {
      name: tag,
      progress: "plain",
      startCommand,
    });
    return { image: tag };
  },

  async delete({ input, ctx }) {
    const tag = buildImageName(ctx.project, ctx.stage, input.name);
    await ctx.client.del(`/images/${encodeURIComponent(tag)}?force=true`);
  },
};
