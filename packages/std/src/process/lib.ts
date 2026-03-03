import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Resolve stdin input - either read from file or use as literal
 */
export async function resolveStdin(
  stdin: string,
  cwd: string,
): Promise<string> {
  // Check if stdin looks like a file path
  if (stdin.startsWith("./") || stdin.startsWith("/")) {
    const filePath = path.isAbsolute(stdin) ? stdin : path.join(cwd, stdin);
    try {
      return await fs.readFile(filePath, "utf-8");
    } catch {
      // If file doesn't exist, treat as literal
      return stdin;
    }
  }
  // Treat as literal string
  return stdin;
}

/**
 * Execute a command and capture stdout
 */
export function executeCommand(
  command: string[],
  cwd: string,
  env: Record<string, string> | undefined,
  stdin: string | undefined,
): Promise<{ stdout: string; exitCode: number }> {
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

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    if (stdin !== undefined) {
      proc.stdin.write(stdin);
      proc.stdin.end();
    } else {
      proc.stdin.end();
    }

    proc.on("close", (code) => {
      const exitCode = code ?? 0;
      if (exitCode !== 0) {
        reject(
          new Error(
            `Command failed with exit code ${exitCode}: ${stderr || stdout}`,
          ),
        );
        return;
      }
      resolve({ stdout, exitCode });
    });

    proc.on("error", (err) => {
      reject(err);
    });
  });
}
