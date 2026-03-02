import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import * as railpack from "@vyft/railpack";
import type { BuildConfig } from "./resource.ts";

function exec(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 10 * 1024 * 1024 }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function execOut(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout.trim());
    });
  });
}

async function statOrNull(path: string) {
  try {
    return await stat(path);
  } catch {
    return null;
  }
}

const SOURCE_EXTS = new Set([".ts", ".js", ".mts", ".mjs", ".cjs", ".cts"]);

/**
 * Resolve a BuildConfig into a build strategy.
 *
 * - If path points to a source file (.ts, .js, …), use railpack with --start-cmd.
 * - If path points to any other file, treat it as a Dockerfile.
 * - If path points to a directory, look for a Dockerfile inside it.
 * - Otherwise, fall back to railpack auto-detect.
 */
async function resolveBuild(
  build: BuildConfig,
): Promise<
  | { mode: "dockerfile"; context: string; dockerfile: string }
  | { mode: "railpack"; context: string; directory: string; startCmd?: string }
> {
  const context = typeof build === "string" ? build : build.context;
  const pathValue = typeof build === "string" ? "." : (build.path ?? ".");

  const fullPath = join(context, pathValue);
  const info = await statOrNull(fullPath);

  if (info?.isFile()) {
    const ext = fullPath.slice(fullPath.lastIndexOf("."));
    if (SOURCE_EXTS.has(ext)) {
      return {
        mode: "railpack",
        context,
        directory: context,
        startCmd: `node ${pathValue}`,
      };
    }
    return { mode: "dockerfile", context, dockerfile: fullPath };
  }

  // path is a directory — check for Dockerfile inside
  const dockerfilePath = join(fullPath, "Dockerfile");
  if (await statOrNull(dockerfilePath)) {
    return { mode: "dockerfile", context, dockerfile: dockerfilePath };
  }

  return { mode: "railpack", context, directory: fullPath };
}

/** Get the sha256 digest of a local Docker image. */
export async function imageDigest(tag: string): Promise<string> {
  return execOut("docker", ["inspect", "--format", "{{.Id}}", tag]);
}

/** Build a Docker image from a BuildConfig. Returns the tag and digest. */
export async function buildImage(
  tag: string,
  build: BuildConfig,
): Promise<{ tag: string; digest: string }> {
  const resolved = await resolveBuild(build);

  if (resolved.mode === "dockerfile") {
    await exec("docker", [
      "build",
      "-t",
      tag,
      "-f",
      resolved.dockerfile,
      resolved.context,
    ]);
  } else {
    const opts: railpack.BuildOptions = { name: tag };
    if (resolved.startCmd) opts.startCommand = resolved.startCmd;
    await railpack.build(resolved.directory, opts);
  }

  const digest = await imageDigest(tag);
  return { tag, digest };
}

/** Pull an image if it doesn't already exist locally. */
export async function pullImage(image: string): Promise<void> {
  try {
    await exec("docker", ["image", "inspect", image]);
  } catch {
    await exec("docker", ["pull", image]);
  }
}

/** Tag and push an image to a registry. */
export async function pushImage(
  localTag: string,
  remoteTag: string,
): Promise<void> {
  await exec("docker", ["tag", localTag, remoteTag]);
  await exec("docker", ["push", remoteTag]);
}
