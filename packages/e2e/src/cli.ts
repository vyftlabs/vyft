import { spawn } from "node:child_process";

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

export async function exec(
  command: string,
  options?: { cwd?: string; env?: Record<string, string> },
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const proc = spawn("sh", ["-c", command], {
      cwd: options?.cwd,
      env: { ...process.env, ...options?.env },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      resolve({ stdout, stderr, code: code ?? 1 });
    });
  });
}
