import { dirname } from "node:path";
import { LockError } from "./error.ts";
import type { FileSystem } from "./fs/types.ts";
import { lockPayloadSchema } from "./schema.ts";

export class Lock {
  private acquired = false;

  private readonly path: string;
  private readonly fs: FileSystem;

  constructor(path: string, fs: FileSystem) {
    this.path = path;
    this.fs = fs;
  }

  async acquire(): Promise<void> {
    await this.fs.mkdir(dirname(this.path), { recursive: true });
    const payload = JSON.stringify({
      pid: process.pid,
      timestamp: new Date().toISOString(),
    });

    try {
      await this.fs.writeFile(this.path, payload, { flag: "wx" });
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;

      const existing = lockPayloadSchema.parse(
        JSON.parse(await this.fs.readFile(this.path, "utf8")),
      );
      if (isProcessAlive(existing.pid)) {
        throw new LockError(
          `State is locked by PID ${existing.pid}. The process is still running.`,
        );
      }

      await this.fs.writeFile(this.path, payload, "utf8");
    }

    this.acquired = true;
  }

  async release(): Promise<void> {
    if (!this.acquired) return;
    await this.fs.unlink(this.path).catch(() => {});
    this.acquired = false;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
