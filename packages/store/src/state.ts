import type { URN } from "@vyft/primitives";

/** Full per-resource state. Structurally compatible with engine's StateEntry. */
export interface ResourceState {
  readonly urn: URN;
  readonly fingerprint: string;
  readonly inputs: Record<string, unknown>;
  readonly outputs: Record<string, unknown>;
  readonly dependencies: URN[];
  readonly created: string;
  readonly modified: string;
  readonly taint: boolean;
  readonly sensitive?: string[];
}

/** URN-keyed state map. */
export type State = Map<URN, ResourceState>;

/** A single WAL entry appended during deploy/destroy for crash recovery. */
export type WALEntry =
  | {
      type: "pending";
      urn: URN;
      action: "creating" | "updating" | "deleting";
    }
  | {
      type: "committed";
      urn: URN;
      fingerprint: string;
      inputs: Record<string, unknown>;
      outputs: Record<string, unknown>;
    }
  | { type: "removed"; urn: URN };
