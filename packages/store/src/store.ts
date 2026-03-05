import { join } from "node:path";
import { nodeFs } from "./fs/node.ts";
import type { FileSystem } from "./fs/types.ts";
import { Lock } from "./lock.ts";
import type { State } from "./state.ts";
import { StateStore } from "./state.ts";
import type { WALEntry } from "./wal.ts";
import { apply, replay, WALog } from "./wal.ts";

export class Store {
  #state: State;
  #deleted = false;
  readonly #dir: string;
  readonly #fs: FileSystem;
  readonly #stateStore: StateStore;
  readonly #wal: WALog;
  readonly #lock: Lock;

  private constructor(
    dir: string,
    fs: FileSystem,
    state: State,
    stateStore: StateStore,
    wal: WALog,
    lock: Lock,
  ) {
    this.#dir = dir;
    this.#fs = fs;
    this.#state = state;
    this.#stateStore = stateStore;
    this.#wal = wal;
    this.#lock = lock;
  }

  static async open(dir: string, fs: FileSystem = nodeFs): Promise<Store> {
    const lock = new Lock(join(dir, "lock"), fs);
    await lock.acquire();

    const stateStore = new StateStore(join(dir, "state.json"), fs);
    const wal = new WALog(join(dir, "wal.jsonl"), fs);

    const snapshot = await stateStore.read();
    const entries = await wal.read();
    const state = entries.length > 0 ? replay(snapshot, entries) : snapshot;

    if (entries.length > 0) {
      await stateStore.write(state);
      await wal.clear();
    }

    return new Store(dir, fs, state, stateStore, wal, lock);
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
    await this.#wal.append(entry);
    apply(this.#state, entry);
  }

  async #compact(): Promise<void> {
    await this.#stateStore.write(this.#state);
    await this.#wal.clear();
  }

  async delete(): Promise<void> {
    this.#deleted = true;
    await this.#fs.rm(this.#dir, { recursive: true, force: true });
  }

  async [Symbol.asyncDispose](): Promise<void> {
    if (!this.#deleted) await this.#compact();
    await this.#lock.release();
  }

  async dispose(): Promise<void> {
    if (!this.#deleted) await this.#compact();
    await this.#lock.release();
  }
}
