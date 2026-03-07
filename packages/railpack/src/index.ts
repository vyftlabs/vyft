import { execFile } from "node:child_process";
import { ensureBinary } from "./binary.ts";
import { ensureBuildKit } from "./buildkit.ts";

export interface BuildOptions {
  /** Image name/tag. */
  name: string;
  /** Target platform, e.g. "linux/amd64". */
  platform?: string;
  /** Override the start command. */
  startCommand?: string;
  /** Override the build command. */
  buildCommand?: string;
  /** Environment variables for the build. */
  env?: Record<string, string>;
  /** Path to railpack config file. */
  configFile?: string;
  /** BuildKit progress mode. */
  progress?: "auto" | "plain" | "tty";
}

export interface PlanResult {
  [key: string]: unknown;
}

function spawn(
  bin: string,
  args: string[],
  env: Record<string, string | undefined>,
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      args,
      { maxBuffer: 50 * 1024 * 1024, env: { ...process.env, ...env } },
      (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout);
      },
    );
  });
}

/** Build an image from a directory using Railpack. */
export async function build(
  directory: string,
  options: BuildOptions,
): Promise<void> {
  const bin = await ensureBinary();
  const host = await ensureBuildKit();

  const args = ["build", directory, "--name", options.name];

  if (options.platform) {
    args.push("--platform", options.platform);
  }
  if (options.startCommand) {
    args.push("--start-cmd", options.startCommand);
  }
  if (options.buildCommand) {
    args.push("--build-cmd", options.buildCommand);
  }
  if (options.configFile) {
    args.push("--config-file", options.configFile);
  }
  if (options.progress) {
    args.push("--progress", options.progress);
  }
  if (options.env) {
    for (const [key, value] of Object.entries(options.env)) {
      args.push("--env", `${key}=${value}`);
    }
  }

  await spawn(bin, args, { BUILDKIT_HOST: host });
}

/** Get the build plan without building. */
export async function plan(directory: string): Promise<PlanResult> {
  const bin = await ensureBinary();
  const host = await ensureBuildKit();
  const output = await spawn(bin, ["plan", directory], { BUILDKIT_HOST: host });
  return JSON.parse(output) as PlanResult;
}

/** Get info about detected project configuration. */
export async function info(
  directory: string,
): Promise<Record<string, unknown>> {
  const bin = await ensureBinary();
  const host = await ensureBuildKit();
  const output = await spawn(bin, ["info", directory], { BUILDKIT_HOST: host });
  return JSON.parse(output) as Record<string, unknown>;
}
