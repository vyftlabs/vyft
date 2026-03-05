import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { executeCommand } from "./process/lib.ts";
import { t } from "./provider.ts";

const SSH_RETRY_DELAY = 5_000;
const SSH_MAX_RETRIES = 24; // 2 minutes total

/**
 * Execute a command on a remote host via SSH.
 *
 * Retries on transient connection errors (refused, timed out, reset)
 * for up to 2 minutes before failing.
 *
 * @example
 * ```ts
 * std.ssh({
 *   command: ["apt-get", "update"],
 *   host: "1.2.3.4",
 *   privateKey: sshKey,
 * })
 * ```
 *
 * @returns Object containing `stdout` and `stderr` artifact references
 */
export const ssh = t
  .resource("ssh")
  .input(
    z.object({
      command: z
        .array(z.string())
        .min(1)
        .describe("Command to execute remotely"),
      host: z.string().describe("SSH host to connect to"),
      user: z.string().default("root").describe("SSH user"),
      privateKey: z.string().describe("SSH private key for authentication"),
      env: z
        .record(z.string(), z.string())
        .optional()
        .describe("Environment variables to set on the remote host"),
      timeout: z
        .number()
        .optional()
        .describe("Timeout in milliseconds for the SSH command"),
    }),
  )
  .handle({
    async create({ input, ctx }) {
      const { stdout, stderr } = await executeSSH(input);
      const stdoutRef = await ctx.artifacts.write("stdout", stdout);
      const stderrRef = await ctx.artifacts.write("stderr", stderr);
      return { stdout: stdoutRef, stderr: stderrRef };
    },
  });

async function executeSSH(input: {
  host: string;
  user: string;
  privateKey: string;
  command: string[];
  env?: Record<string, string> | undefined;
  timeout?: number | undefined;
}): Promise<{ stdout: string; stderr: string }> {
  const keyPath = path.join(os.tmpdir(), `vyft-ssh-${Date.now()}`);
  await fs.writeFile(keyPath, input.privateKey, { mode: 0o600 });

  try {
    let remoteCmd = input.command.map(shellEscape).join(" ");
    if (input.env && Object.keys(input.env).length > 0) {
      const envPrefix = Object.entries(input.env)
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
      `${input.user}@${input.host}`,
      remoteCmd,
    ];

    for (let attempt = 0; attempt < SSH_MAX_RETRIES; attempt++) {
      try {
        const { stdout, stderr } = await executeCommand(
          sshArgs,
          process.cwd(),
          undefined,
          undefined,
          input.timeout,
        );
        return { stdout, stderr };
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
