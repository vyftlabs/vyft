import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import * as railpack from "@vyft/railpack";

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

const NODE_EXTS = new Set([".ts", ".js", ".mts", ".mjs", ".cjs", ".cts"]);
const RAILPACK_EXTS = new Set([".go"]);

/**
 * Resolve a build path into a build strategy.
 *
 * - Node source file (.ts, .js, …) → railpack with `node <path>` start command
 * - Railpack-supported source file (.go) → railpack auto-detect
 * - File named Dockerfile* → docker build
 * - Directory with Dockerfile inside → docker build
 * - Directory without Dockerfile → railpack auto-detect
 * - Anything else → error
 */
async function resolveBuild(
  buildPath: string,
  buildCwd?: string,
): Promise<
  | { mode: "dockerfile"; context: string; dockerfile: string }
  | { mode: "railpack"; context: string; directory: string; startCmd?: string }
> {
  const context = buildCwd ?? ".";
  const pathValue = buildPath;

  const fullPath = join(context, pathValue);
  const info = await statOrNull(fullPath);

  if (info?.isFile()) {
    const ext = fullPath.slice(fullPath.lastIndexOf("."));
    if (NODE_EXTS.has(ext)) {
      return {
        mode: "railpack",
        context,
        directory: context,
        startCmd: `node ${pathValue}`,
      };
    }
    if (RAILPACK_EXTS.has(ext)) {
      return { mode: "railpack", context, directory: context };
    }
    const basename = fullPath.slice(fullPath.lastIndexOf("/") + 1);
    if (basename.startsWith("Dockerfile")) {
      return { mode: "dockerfile", context, dockerfile: fullPath };
    }
    throw new Error(
      `Cannot determine build strategy for "${buildPath}": not a source file or Dockerfile`,
    );
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

/** Build a Docker image from a path + context. Returns the tag and digest. */
export async function buildImage(
  tag: string,
  buildPath: string,
  buildCwd?: string,
): Promise<{ tag: string; digest: string }> {
  const resolved = await resolveBuild(buildPath, buildCwd);

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
