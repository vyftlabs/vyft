import {
  mkdir,
  open,
  readFile,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { LockError } from "../error.ts";
import { lockPayloadSchema } from "../schema.ts";
import type { StorageBackend } from "./types.ts";

export class LocalBackend implements StorageBackend {
  readonly #dir: string;

  constructor(dir: string) {
    this.#dir = dir;
  }

  get #lockPath(): string {
    return join(this.#dir, "lock");
  }

  async read(key: string): Promise<string | null> {
    try {
      return await readFile(join(this.#dir, key), "utf8");
    } catch (err: unknown) {
      if (isErrnoException(err) && err.code === "ENOENT") return null;
      throw err;
    }
  }

  async write(key: string, data: string): Promise<void> {
    await mkdir(this.#dir, { recursive: true });
    const tmp = join(this.#dir, `.${key}.tmp`);
    const fd = await open(tmp, "w");
    try {
      await fd.writeFile(data, "utf8");
      await fd.sync();
    } finally {
      await fd.close();
    }
    await rename(tmp, join(this.#dir, key));
  }

  async append(key: string, data: string): Promise<void> {
    await mkdir(this.#dir, { recursive: true });
    const fd = await open(join(this.#dir, key), "a");
    try {
      await fd.writeFile(data, "utf8");
      await fd.sync();
    } finally {
      await fd.close();
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(join(this.#dir, key));
    } catch (err: unknown) {
      if (isErrnoException(err) && err.code === "ENOENT") return;
      throw err;
    }
  }

  async deleteAll(prefix: string): Promise<void> {
    if (prefix === "") {
      await rm(this.#dir, { recursive: true, force: true });
      return;
    }
    await rm(join(this.#dir, prefix), { recursive: true, force: true });
  }

  async lock(): Promise<void> {
    await mkdir(this.#dir, { recursive: true });
    const payload = JSON.stringify({
      pid: process.pid,
      timestamp: new Date().toISOString(),
    });

    try {
      await writeFile(this.#lockPath, payload, { flag: "wx" });
    } catch (err: unknown) {
      if (!isErrnoException(err) || err.code !== "EEXIST") throw err;

      try {
        const raw = await readFile(this.#lockPath, "utf8");
        const existing = lockPayloadSchema.parse(JSON.parse(raw));
        if (isProcessAlive(existing.pid)) {
          throw new LockError(
            `State is locked by PID ${existing.pid}. The process is still running.`,
          );
        }
      } catch (innerErr) {
        if (innerErr instanceof LockError) throw innerErr;
        // Lock file disappeared or is corrupt — treat as stale
      }

      // Stale lock: remove and retry with exclusive create
      try {
        await unlink(this.#lockPath);
      } catch {
        // Already removed by another process
      }

      try {
        await writeFile(this.#lockPath, payload, { flag: "wx" });
      } catch (retryErr: unknown) {
        if (isErrnoException(retryErr) && retryErr.code === "EEXIST") {
          throw new LockError(
            "Lock was taken by another process during takeover",
          );
        }
        throw retryErr;
      }
    }
  }

  async unlock(): Promise<void> {
    try {
      await unlink(this.#lockPath);
    } catch (err: unknown) {
      if (isErrnoException(err) && err.code === "ENOENT") return;
      throw err;
    }
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

function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}
