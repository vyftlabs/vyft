import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { defineResource } from "@vyft/provider";
import { executeCommand } from "./process/lib.ts";

const SSH_RETRY_DELAY = 5_000;
const SSH_MAX_RETRIES = 24; // 2 minutes total

export interface SshArgs {
  command: string[];
  host: string;
  user?: string;
  privateKey: string;
  env?: Record<string, string>;
  timeout?: number;
}

export const ssh = defineResource<SshArgs>("ssh", {
  async create({ input, ctx }) {
    const { stdout, stderr } = await executeSSH(input);
    const stdoutRef = await ctx.artifacts.write("stdout", stdout);
    const stderrRef = await ctx.artifacts.write("stderr", stderr);
    return { output: { stdout: stdoutRef, stderr: stderrRef } };
  },
});

async function executeSSH(
  input: SshArgs,
): Promise<{ stdout: string; stderr: string }> {
  const user = input.user ?? "root";
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
      `${user}@${input.host}`,
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
