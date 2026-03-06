import {
  appendFile,
  mkdir,
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
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async write(key: string, data: string): Promise<void> {
    await mkdir(this.#dir, { recursive: true });
    const tmp = join(this.#dir, `.${key}.tmp`);
    await writeFile(tmp, data, "utf8");
    await rename(tmp, join(this.#dir, key));
  }

  async append(key: string, data: string): Promise<void> {
    await mkdir(this.#dir, { recursive: true });
    await appendFile(join(this.#dir, key), data, "utf8");
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(join(this.#dir, key));
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
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
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;

      const existing = lockPayloadSchema.parse(
        JSON.parse(await readFile(this.#lockPath, "utf8")),
      );
      if (isProcessAlive(existing.pid)) {
        throw new LockError(
          `State is locked by PID ${existing.pid}. The process is still running.`,
        );
      }

      await writeFile(this.#lockPath, payload, "utf8");
    }
  }

  async unlock(): Promise<void> {
    try {
      await unlink(this.#lockPath);
    } catch {
      // silent on missing
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
