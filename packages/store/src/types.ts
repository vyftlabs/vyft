import type { ResourceState } from "@vyft/core";

export type { ResourceState } from "@vyft/core";

/** AES-256-GCM encrypted payload with scrypt-derived key. All fields are base64. */
export interface EncryptedPayload {
  readonly salt: string;
  readonly iv: string;
  readonly data: string;
  readonly tag: string;
}

/** The full persisted state file shape. */
export interface PersistedState {
  readonly version: number;
  readonly manifest: { readonly timestamp: string; readonly tool: string };
  readonly resources: ResourceState[];
  readonly secrets: EncryptedPayload | null;
  readonly secretOutputs?: EncryptedPayload | null;
}

/** A single WAL entry appended during deploy/destroy. */
export type WALEntry =
  | {
      type: "pending";
      id: string;
      operation: "creating" | "updating" | "deleting";
    }
  | { type: "committed"; id: string; state: ResourceState }
  | { type: "removed"; id: string };

/** Dumb persistence backend — reads and writes state, knows nothing about encryption. */
export interface Store {
  load(
    context: string,
    project: string,
    stage: string,
  ): Promise<PersistedState | null>;
  save(
    context: string,
    project: string,
    stage: string,
    state: PersistedState,
  ): Promise<void>;
  delete(context: string, project: string, stage: string): Promise<void>;
  lock(
    context: string,
    project: string,
    stage: string,
  ): Promise<() => Promise<void>>;
  inspectLock(
    context: string,
    project: string,
    stage: string,
  ): Promise<{ pid: number; timestamp: string } | null>;
  clearLock(context: string, project: string, stage: string): Promise<void>;
  appendLog(
    context: string,
    project: string,
    stage: string,
    entry: WALEntry,
  ): Promise<void>;
  compact(
    context: string,
    project: string,
    stage: string,
    state: PersistedState,
  ): Promise<void>;
  hasWAL(context: string, project: string, stage: string): Promise<boolean>;
}

/** Per-stage config values (plain + encrypted secrets). */
export interface StageData {
  readonly version: number;
  readonly values: Record<string, string>;
  readonly secrets: EncryptedPayload | null;
}

export interface StageStore {
  loadStage(stage: string): Promise<StageData | null>;
  saveStage(stage: string, data: StageData): Promise<void>;
  deleteStage(stage: string): Promise<void>;
  listStages(): Promise<string[]>;
}
