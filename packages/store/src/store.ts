import type { StorageBackend } from "./backend/types.ts";
import { StateCorruptedError } from "./error.ts";
import { stateFileSchema } from "./schema.ts";
import type { State } from "./state.ts";
import type { WALEntry } from "./wal.ts";
import { apply, parseWAL, replay } from "./wal.ts";

export class Store {
  #state: State;
  #deleted = false;
  #disposed = false;
  readonly #backend: StorageBackend;

  private constructor(backend: StorageBackend, state: State) {
    this.#backend = backend;
    this.#state = state;
  }

  static async open(backend: StorageBackend): Promise<Store> {
    await backend.lock();

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
      await backend.unlock();
      throw err;
    }
  }

  get size(): number {
    return this.#state.size;
  }

  get(key: string): unknown {
    return this.#state.get(key);
  }

  has(key: string): boolean {
    return this.#state.has(key);
  }

  entries(): IterableIterator<[string, unknown]> {
    return this.#state.entries();
  }

  async append(entry: WALEntry): Promise<void> {
    if (this.#disposed) throw new Error("Store is disposed");
    if (this.#deleted) throw new Error("Store is deleted");
    await this.#backend.append("wal.jsonl", `${JSON.stringify(entry)}\n`);
    apply(this.#state, entry);
  }

  async #compact(): Promise<void> {
    await this.#backend.write(
      "state.json",
      `${JSON.stringify(Object.fromEntries(this.#state), null, 2)}\n`,
    );
    await this.#backend.delete("wal.jsonl");
  }

  async delete(): Promise<void> {
    this.#deleted = true;
    await this.#backend.deleteAll("");
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.dispose();
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    try {
      if (!this.#deleted) await this.#compact();
    } finally {
      await this.#backend.unlock();
    }
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
