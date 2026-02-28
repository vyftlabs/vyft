import type { Resource } from "../resource.ts";

export interface StateEntry {
  readonly id: string;
  readonly kind: Resource["kind"];
  readonly fingerprint: string;
  readonly inputs?: Record<string, unknown>;
}

/** A detected difference between desired and current state. */
export type Change =
  | { status: "create"; resource: Resource }
  | { status: "modify"; resource: Resource; previous?: Record<string, unknown> }
  | { status: "remove"; id: string; kind: Resource["kind"] };

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
      kind === "service" ||
      kind === "cronjob"
    ) {
      return r["id"];
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
 * Stable fingerprint of a resource. Only serializes kind, id, and config —
 * derived fields (host, port, url) are excluded. Keys are sorted for stability.
 */
export function fingerprint(resource: Resource): string {
  const minimal = {
    kind: resource.kind,
    id: resource.id,
    config: resource.config,
  };
  return JSON.stringify(minimal, stableReplacer);
}

/** Diff desired resources against current state. Runtime-agnostic — just detects changes. */
export function plan(
  desired: Resource[],
  current: StateEntry[],
  taintedIds?: Set<string>,
): Change[] {
  const currentMap = new Map<string, StateEntry>();
  for (const entry of current) {
    currentMap.set(entry.id, entry);
  }

  const changes: Change[] = [];
  const seen = new Set<string>();

  for (const resource of desired) {
    seen.add(resource.id);
    const prev = currentMap.get(resource.id);

    if (!prev) {
      changes.push({ status: "create", resource });
    } else {
      const isTainted = taintedIds?.has(resource.id);
      const configChanged = prev.fingerprint !== fingerprint(resource);

      if (configChanged || isTainted) {
        changes.push({
          status: "modify",
          resource,
          // Tainted resources must always rebuild — omit previous so runtimes
          // fall back to unconditional recreate/update.  Only provide previous
          // for genuine config changes where runtimes can diff precisely.
          ...(!isTainted && prev.inputs != null
            ? { previous: prev.inputs }
            : {}),
        });
      }
    }
  }

  for (const entry of current) {
    if (!seen.has(entry.id)) {
      changes.push({ status: "remove", id: entry.id, kind: entry.kind });
    }
  }

  return changes;
}
