import type { StorageBackend } from "./backend/types.ts";
import { LockError, StateCorruptedError } from "./error.ts";
import { stateFileSchema } from "./schema.ts";
import type { State } from "./state.ts";
import type { WALEntry } from "./wal.ts";
import { parseWAL, replay } from "./wal.ts";

export class Store {
  #state: State;
  #deleted = false;
  #disposed = false;
  #dirtyWAL = false;
  #appendQueue: Promise<void> = Promise.resolve();
  readonly #backend: StorageBackend;

  private constructor(backend: StorageBackend, state: State) {
    this.#backend = backend;
    this.#state = state;
  }

  static async open(backend: StorageBackend): Promise<Store> {
    try {
      await backend.lock();
    } catch (err) {
      if (err instanceof LockError) throw err;
      throw new LockError(
        `Failed to acquire lock: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    try {
      const snapshot = parseState(await backend.read("state.json"));
      const walRaw = await backend.read("wal.jsonl");
      const entries = walRaw ? parseWAL(walRaw) : [];
      const state = entries.length > 0 ? replay(snapshot, entries) : snapshot;

      if (entries.length > 0) {
        await backend.write(
          "state.json",
          `${JSON.stringify(Object.fromEntries(state), null, 2)}\n`,
        );
        await backend.delete("wal.jsonl");
      }

      return new Store(backend, state);
    } catch (err) {
      try {
        await backend.unlock();
      } catch {
        // Unlock failed, but the original error is more important
      }
      throw err;
    }
  }

  get size(): number {
    return this.#state.size;
  }

  get(key: string): unknown {
    const value = this.#state.get(key);
    if (value === null || typeof value !== "object") return value;
    return JSON.parse(JSON.stringify(value));
  }

  has(key: string): boolean {
    return this.#state.has(key);
  }

  *entries(): IterableIterator<[string, unknown]> {
    for (const [key, value] of this.#state) {
      if (value === null || typeof value !== "object") {
        yield [key, value];
      } else {
        yield [key, JSON.parse(JSON.stringify(value))];
      }
    }
  }

  async append(entry: WALEntry): Promise<void> {
    if (this.#disposed) throw new Error("Store is disposed");
    if (this.#deleted) throw new Error("Store is deleted");
    if (entry.type === "set" && entry.data === undefined) {
      throw new Error("Cannot store undefined — use null instead");
    }
    // Snapshot eagerly to prevent caller mutation after append() returns
    const serialized = JSON.stringify(entry);
    const key = entry.key;
    const type = entry.type;
    const data =
      type === "set"
        ? (JSON.parse(serialized) as { data: unknown }).data
        : undefined;
    const op = this.#appendQueue.then(async () => {
      const prefix = this.#dirtyWAL ? "\n" : "";
      this.#dirtyWAL = true;
      await this.#backend.append("wal.jsonl", `${prefix}${serialized}\n`);
      this.#dirtyWAL = false;
      if (type === "set") {
        this.#state.set(key, data);
      } else {
        this.#state.delete(key);
      }
    });
    this.#appendQueue = op.catch(() => {});
    await op;
  }

  async #compact(): Promise<void> {
    await this.#appendQueue;
    await this.#backend.write(
      "state.json",
      `${JSON.stringify(Object.fromEntries(this.#state), null, 2)}\n`,
    );
    await this.#backend.delete("wal.jsonl");
  }

  async delete(): Promise<void> {
    this.#deleted = true;
    await this.#appendQueue;
    await this.#backend.delete("state.json");
    await this.#backend.delete("wal.jsonl");
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.dispose();
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    let compactError: unknown;
    try {
      if (!this.#deleted) await this.#compact();
    } catch (err) {
      compactError = err;
    }
    try {
      await this.#backend.unlock();
    } catch (err) {
      if (!compactError) throw err;
      // Both failed — compact error is more important
    }
    if (compactError) throw compactError;
  }
}

function parseState(raw: string | null): State {
  if (raw === null) return new Map();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new StateCorruptedError("Invalid JSON in state file");
  }

  const result = stateFileSchema.safeParse(parsed);
  if (!result.success) {
    throw new StateCorruptedError(
      `Invalid state file: ${result.error.message}`,
    );
  }

  const state: State = new Map();
  for (const [key, value] of Object.entries(result.data)) {
    state.set(key, value);
  }
  return state;
}
