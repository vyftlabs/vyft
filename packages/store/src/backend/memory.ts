import { LockError } from "../error.ts";
import type { StorageBackend } from "./types.ts";

export class MemoryBackend implements StorageBackend {
  readonly #files = new Map<string, string>();
  #locked = false;

  async read(key: string): Promise<string | null> {
    return this.#files.get(key) ?? null;
  }

  async write(key: string, data: string): Promise<void> {
    this.#files.set(key, data);
  }

  async append(key: string, data: string): Promise<void> {
    this.#files.set(key, (this.#files.get(key) ?? "") + data);
  }

  async delete(key: string): Promise<void> {
    this.#files.delete(key);
  }

  async deleteAll(prefix: string): Promise<void> {
    if (prefix === "") {
      this.#files.clear();
      return;
    }
    for (const key of this.#files.keys()) {
      if (key.startsWith(prefix)) {
        this.#files.delete(key);
      }
    }
  }

  async lock(): Promise<void> {
    if (this.#locked) {
      throw new LockError("Store is already locked");
    }
    this.#locked = true;
  }

  async unlock(): Promise<void> {
    this.#locked = false;
  }
}
