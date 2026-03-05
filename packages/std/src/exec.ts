import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as tar from "tar";
import { glob as tinyglob } from "tinyglobby";
import { z } from "zod";
import { executeCommand, resolveStdin } from "./process/lib.ts";
import { t } from "./provider.ts";

/**
 * Execute a shell command and capture its output.
 *
 * Runs a command with optional stdin, environment variables, and working directory.
 * Supports input file tracking for cache invalidation and output file capture for
 * cache restoration in CI/CD pipelines. Optionally runs over SSH via `connection`.
 *
 * @example
 * ```ts
 * // Simple command
 * std.exec({ command: ["echo", "hello"] })
 *
 * // Build with caching
 * std.exec({
 *   command: ["npm", "run", "build"],
 *   cwd: "./my-project",
 *   inputs: ["src/**", "package.json"],
 *   outputs: ["dist/**"],
 * })
 *
 * // Remote execution via SSH
 * std.exec({
 *   command: ["apt-get", "update"],
 *   connection: { host: "1.2.3.4", privateKey: sshKey },
 * })
 * ```
 *
 * @returns Object containing `stdout` artifact reference
 */
export const exec = t
  .resource("exec")
  .input(
    z.object({
      command: z
        .array(z.string())
        .min(1)
        .describe("Command to execute as an array of strings"),
      stdin: z
        .string()
        .optional()
        .describe(
          "Stdin input - file path (starts with ./ or /) or literal string",
        ),
      env: z
        .record(z.string(), z.string())
        .optional()
        .describe("Environment variables to set for the command"),
      cwd: z
        .string()
        .optional()
        .describe("Working directory for command execution"),
      inputs: z
        .array(z.string())
        .optional()
        .describe(
          "Glob patterns for input files - used for cache invalidation",
        ),
      outputs: z
        .array(z.string())
        .optional()
        .describe(
          "Glob patterns for output files - captured as artifact for cache restoration",
        ),
      exclude: z
        .array(z.string())
        .optional()
        .describe("Glob patterns to exclude from inputs/outputs"),
      connection: z
        .object({
          host: z.string(),
          privateKey: z.string(),
        })
        .optional()
        .describe("SSH connection for remote execution"),
    }),
  )
  .handle({
    async create({ input, ctx }) {
      if (input.connection) {
        const stdout = await executeSSH(
          input.connection,
          input.command,
          input.env,
        );
        const stdoutRef = await ctx.artifacts.write("stdout", stdout);
        return { stdout: stdoutRef };
      }

      const cwd = input.cwd ?? process.cwd();

      let stdinData: string | undefined;
      if (input.stdin !== undefined) {
        stdinData = await resolveStdin(input.stdin, cwd);
      }

      const { stdout } = await executeCommand(
        input.command,
        cwd,
        input.env,
        stdinData,
      );

      const stdoutRef = await ctx.artifacts.write("stdout", stdout);

      if (input.outputs !== undefined && input.outputs.length > 0) {
        const outputFiles = await tinyglob(input.outputs, {
          cwd,
          ...(input.exclude !== undefined ? { ignore: input.exclude } : {}),
          dot: true,
          onlyFiles: true,
        });

        if (outputFiles.length > 0) {
          const tarball = await createTarball(cwd, outputFiles);
          await ctx.artifacts.write("outputs", tarball);
        }
      }

      return {
        stdout: stdoutRef,
      };
    },
  });

async function createTarball(cwd: string, files: string[]): Promise<Buffer> {
  const tmpPath = path.join(os.tmpdir(), `exec-outputs-${Date.now()}.tar.gz`);
  await tar.create({ gzip: true, file: tmpPath, cwd }, files);
  const data = await fs.readFile(tmpPath);
  await fs.unlink(tmpPath);
  return data;
}

const SSH_RETRY_DELAY = 5_000;
const SSH_MAX_RETRIES = 24; // 2 minutes total

async function executeSSH(
  connection: { host: string; privateKey: string },
  command: string[],
  env?: Record<string, string>,
): Promise<string> {
  // Write private key to temp file for ssh
  const keyPath = path.join(os.tmpdir(), `vyft-ssh-${Date.now()}`);
  await fs.writeFile(keyPath, connection.privateKey, { mode: 0o600 });

  try {
    // Build the remote command with env vars
    let remoteCmd = command.map(shellEscape).join(" ");
    if (env && Object.keys(env).length > 0) {
      const envPrefix = Object.entries(env)
        .map(([k, v]) => `${k}=${shellEscape(v)}`)
        .join(" ");
      remoteCmd = `${envPrefix} ${remoteCmd}`;
    }

    const sshArgs = [
      "ssh",
      "-o",
      "StrictHostKeyChecking=no",
      "-o",
      "UserKnownHostsFile=/dev/null",
      "-o",
      "ConnectTimeout=10",
      "-i",
      keyPath,
      `root@${connection.host}`,
      remoteCmd,
    ];

    // Retry until reachable
    for (let attempt = 0; attempt < SSH_MAX_RETRIES; attempt++) {
      try {
        const { stdout } = await executeCommand(
          sshArgs,
          process.cwd(),
          undefined,
          undefined,
        );
        return stdout;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isConnectionError =
          msg.includes("Connection refused") ||
          msg.includes("Connection timed out") ||
          msg.includes("No route to host") ||
          msg.includes("Connection reset");
        if (!isConnectionError || attempt === SSH_MAX_RETRIES - 1) {
          throw err;
        }
        await new Promise((r) => setTimeout(r, SSH_RETRY_DELAY));
      }
    }
    throw new Error("SSH connection failed after max retries");
  } finally {
    await fs.unlink(keyPath).catch(() => {});
  }
}

function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
