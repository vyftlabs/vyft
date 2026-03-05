import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Read stdin content from a file path, resolved relative to cwd.
 */
export async function readStdinFile(
  filePath: string,
  cwd: string,
): Promise<string> {
  const resolved = path.isAbsolute(filePath)
    ? filePath
    : path.join(cwd, filePath);
  return fs.readFile(resolved, "utf-8");
}

/**
 * Execute a command and capture stdout and stderr.
 */
export function executeCommand(
  command: string[],
  cwd: string,
  env: Record<string, string> | undefined,
  stdin: string | undefined,
  timeout?: number,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const [cmd, ...args] = command;

    if (cmd === undefined) {
      reject(new Error("Command cannot be empty"));
      return;
    }

    const proc = spawn(cmd, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    if (timeout !== undefined) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        proc.kill("SIGTERM");
      }, timeout);
    }

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    if (stdin !== undefined) {
      proc.stdin.write(stdin);
    }
    proc.stdin.end();

    proc.on("close", (code) => {
      if (timeoutId) clearTimeout(timeoutId);
      if (timedOut) {
        reject(new Error(`Command timed out after ${timeout}ms`));
        return;
      }
      const exitCode = code ?? 0;
      if (exitCode !== 0) {
        reject(
          new Error(
            `Command failed with exit code ${exitCode}: ${stderr || stdout}`,
          ),
        );
        return;
      }
      resolve({ stdout, stderr, exitCode });
    });

    proc.on("error", (err) => {
      if (timeoutId) clearTimeout(timeoutId);
      reject(err);
    });
  });
}
