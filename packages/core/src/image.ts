import { execFile } from "node:child_process";
import type { BuildConfig } from "./resource.ts";

function exec(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 10 * 1024 * 1024 }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function resolveBuild(build: BuildConfig): {
  context: string;
  dockerfile: string;
} {
  if (typeof build === "string")
    return { context: build, dockerfile: "Dockerfile" };
  return {
    context: build.context,
    dockerfile: build.dockerfile ?? "Dockerfile",
  };
}

/** Build a Docker image from a BuildConfig. Returns the built image tag. */
export async function buildImage(
  tag: string,
  build: BuildConfig,
): Promise<string> {
  const { context, dockerfile } = resolveBuild(build);
  await exec("docker", [
    "build",
    "-t",
    tag,
    "-f",
    `${context}/${dockerfile}`,
    context,
  ]);
  return tag;
}

/** Tag and push an image to a registry. */
export async function pushImage(
  localTag: string,
  remoteTag: string,
): Promise<void> {
  await exec("docker", ["tag", localTag, remoteTag]);
  await exec("docker", ["push", remoteTag]);
}
