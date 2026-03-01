import type { Resource } from "./resource.ts";

/** Full per-resource state. Structurally compatible with engine's StateEntry. */
export interface ResourceState {
  readonly id: string;
  readonly kind: Resource["kind"] | "secret";
  readonly fingerprint: string;
  readonly inputs: Record<string, unknown>;
  readonly outputs: Record<string, unknown>;
  readonly dependencies: string[];
  readonly runtime: Record<string, unknown>;
  readonly created: string;
  readonly modified: string;
  readonly taint: boolean;
}
