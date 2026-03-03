import type { Resource } from "./resource.ts";
import { MOUNTABLE } from "./resource.ts";

export interface StateEntry {
  readonly id: string;
  readonly kind: Resource["kind"] | "secret";
  readonly fingerprint: string;
  readonly inputs?: Record<string, unknown>;
}

/** A detected difference between desired and current state. */
export type Change =
  | { status: "create"; resource: Resource }
  | { status: "modify"; resource: Resource; previous?: Record<string, unknown> }
  | { status: "remove"; id: string; kind: Resource["kind"] | "secret" };

/** JSON replacer that swaps nested resources for their IDs. */
export function resourceReplacer(key: string, value: unknown): unknown {
  if (
    key !== "" &&
    typeof value === "object" &&
    value !== null &&
    "kind" in value
  ) {
    const r = value as Record<string, unknown>;
    const kind = r["kind"];
    if (
      kind === "volume" ||
      kind === "secret" ||
      kind === "config" ||
      kind === "service" ||
      kind === "cronjob" ||
      kind === "bind"
    ) {
      return r["id"];
    }
    // Catch-all for any MOUNTABLE-branded resource (e.g. Archive from @vyft/fs)
    if (MOUNTABLE in (value as object)) {
      return (value as unknown as { id: string }).id;
    }
  }
  return value;
}

/**
 * Serialize a resource config with nested resources replaced by ID strings.
 * Uses resourceReplacer (not stableReplacer, which is private) — key sorting
 * is only needed for fingerprint stability. serializeConfig is for field-level
 * diffing where both sides go through the same replacer, so insertion-order
 * consistency suffices. Idempotent: resources are replaced by ID strings on
 * the first pass, so a second pass is a no-op.
 */
export function serializeConfig(config: object): Record<string, unknown> {
  return JSON.parse(JSON.stringify(config, resourceReplacer)) as Record<
    string,
    unknown
  >;
}

/** Combines resource replacement with sorted-key serialization for stability. */
function stableReplacer(key: string, value: unknown): unknown {
  const replaced = resourceReplacer(key, value);
  if (replaced && typeof replaced === "object" && !Array.isArray(replaced)) {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(replaced as Record<string, unknown>).sort()) {
      sorted[k] = (replaced as Record<string, unknown>)[k];
    }
    return sorted;
  }
  return replaced;
}

/**
 * Stable fingerprint of a resource. Only serializes kind, id, and config/input —
 * derived fields (host, port, url) are excluded. Keys are sorted for stability.
 */
export function fingerprint(resource: Resource): string {
  const minimal =
    resource.kind === "provider"
      ? {
          kind: resource.kind,
          id: resource.id,
          provider: resource.provider,
          type: resource.type,
          input: resource.input,
        }
      : {
          kind: resource.kind,
          id: resource.id,
          config: resource.config,
        };
  return JSON.stringify(minimal, stableReplacer);
}
