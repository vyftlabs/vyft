import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { VyftError } from "@vyft/errors";

export class LockError extends VyftError {}

/**
 * File-based exclusive lock.
 */
export class Lock {
  private acquired = false;

  private readonly path: string;
  constructor(path: string) {
    this.path = path;
  }

  async acquire(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const payload = JSON.stringify({
      pid: process.pid,
      timestamp: new Date().toISOString(),
    });

    try {
      await writeFile(this.path, payload, { flag: "wx" });
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;

      // Lock file exists — check whether the holder is still alive
      const existing = JSON.parse(await readFile(this.path, "utf8")) as {
        pid: number;
      };
      if (isProcessAlive(existing.pid)) {
        throw new LockError(
          `State is locked by PID ${existing.pid}. The process is still running.`,
        );
      }

      // Stale lock from a dead process — take it over
      await writeFile(this.path, payload, "utf8");
    }

    this.acquired = true;
  }

  async release(): Promise<void> {
    if (!this.acquired) return;
    await unlink(this.path).catch(() => {});
    this.acquired = false;
  }

  async inspect(): Promise<{ pid: number; timestamp: string } | null> {
    try {
      const raw = await readFile(this.path, "utf8");
      return JSON.parse(raw) as { pid: number; timestamp: string };
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async clear(): Promise<void> {
    await unlink(this.path).catch((err: unknown) => {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    });
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
