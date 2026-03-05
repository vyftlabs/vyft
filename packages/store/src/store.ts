import { rm } from "node:fs/promises";
import { join } from "node:path";
import { Lock, LockError } from "./lock.ts";
import type { State, WALEntry } from "./state.ts";
import { StateStore } from "./state-store.ts";
import { replay, WALog } from "./wal.ts";

export { LockError };

/**
 * Manages `State` (Map<URN, ResourceState>) + WAL.
 * No crypto, no metadata, no secrets knowledge.
 */
export class Store {
  /** In-memory state, updated by append(). */
  state: State;

  private readonly dir: string;
  private readonly stateStore: StateStore;
  private readonly wal: WALog;
  private readonly lock: Lock;

  private constructor(
    dir: string,
    state: State,
    stateStore: StateStore,
    wal: WALog,
    lock: Lock,
  ) {
    this.dir = dir;
    this.state = state;
    this.stateStore = stateStore;
    this.wal = wal;
    this.lock = lock;
  }

  /**
   * Open a store: acquire lock → read state.json → replay WAL → populate state.
   */
  static async open(dir: string): Promise<Store> {
    const lock = new Lock(join(dir, "lock"));
    await lock.acquire();

    const stateStore = new StateStore(join(dir, "state.json"));
    const wal = new WALog(join(dir, "wal.jsonl"));

    const snapshot = await stateStore.read();
    const entries = await wal.read();
    const state = entries.length > 0 ? replay(snapshot, entries) : snapshot;

    return new Store(dir, state, stateStore, wal, lock);
  }

  /** Persist a WAL entry and update in-memory state. */
  async append(entry: WALEntry): Promise<void> {
    await this.wal.append(entry);
    this.state = replay(this.state, [entry]);
  }

  /** Write state.json from this.state and clear WAL. */
  async checkpoint(): Promise<void> {
    await this.stateStore.write(this.state);
    await this.wal.clear();
  }

  /** Remove the entire state directory. */
  async delete(): Promise<void> {
    await rm(this.dir, { recursive: true, force: true });
  }

  /** Check if WAL has entries (for UI/diagnostics). */
  async hasWAL(): Promise<boolean> {
    return this.wal.exists();
  }

  /** Release the lock. */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.lock.release();
  }

  /** Manual dispose for callers that can't use `await using`. */
  async dispose(): Promise<void> {
    await this.lock.release();
  }
}
