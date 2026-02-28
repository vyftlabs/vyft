import type { Resource } from "../resource.ts";

/** Full per-resource state. Structurally compatible with engine's StateEntry. */
export interface ResourceState {
  readonly id: string;
  readonly kind: Resource["kind"];
  readonly fingerprint: string;
  readonly inputs: Record<string, unknown>;
  readonly outputs: Record<string, unknown>;
  readonly dependencies: string[];
  readonly runtime: Record<string, unknown>;
  readonly created: string;
  readonly modified: string;
  readonly taint: boolean;
}

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
  load(context: string, project: string): Promise<PersistedState | null>;
  save(context: string, project: string, state: PersistedState): Promise<void>;
  delete(context: string, project: string): Promise<void>;
  lock(context: string, project: string): Promise<() => Promise<void>>;
  inspectLock(
    context: string,
    project: string,
  ): Promise<{ pid: number; timestamp: string } | null>;
  clearLock(context: string, project: string): Promise<void>;
  appendLog(context: string, project: string, entry: WALEntry): Promise<void>;
  compact(
    context: string,
    project: string,
    state: PersistedState,
  ): Promise<void>;
  hasWAL(context: string, project: string): Promise<boolean>;
}
