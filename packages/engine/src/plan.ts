import { createHash } from "node:crypto";
import type { Resource, URN } from "@vyft/primitives";
import { buildURN, MOUNTABLE } from "@vyft/primitives";
import { buildGraph } from "./graph.ts";
import { levels } from "./order.ts";
import { validate } from "./validate.ts";

export interface StateEntry {
  readonly urn: URN;
  readonly fingerprint: string;
  readonly inputs?: Record<string, unknown>;
}

/** A detected difference between desired and current state. */
export type Change =
  | { status: "create"; resource: Resource }
  | { status: "modify"; resource: Resource; previous?: Record<string, unknown> }
  | { status: "remove"; urn: URN };

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
      kind === "variable" ||
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
 * Stable fingerprint of a resource — SHA-256 hash of identity + config.
 * Keys are sorted for stability.
 */
export function fingerprint(resource: Resource): string {
  const urnOrId = resource.urn ?? `${resource.kind}:${resource.id}`;
  const minimal =
    resource.kind === "provider"
      ? {
          urn: urnOrId,
          kind: resource.kind,
          id: resource.id,
          provider: resource.provider,
          type: resource.type,
          input: resource.input,
        }
      : {
          urn: urnOrId,
          kind: resource.kind,
          id: resource.id,
          config: resource.config,
        };
  const json = JSON.stringify(minimal, stableReplacer);
  return createHash("sha256").update(json).digest("hex");
}

/** Derive a URN for a resource based on its kind and id. */
export function resourceURN(resource: Resource): URN {
  if (resource.urn) return resource.urn;
  // Fallback: derive URN from kind
  if (resource.kind === "provider") {
    return buildURN("provider", resource.provider, resource.type, resource.id);
  }
  // Runtime resources (service, job, cronjob) and platform resources (volume, variable)
  const module =
    resource.kind === "volume" || resource.kind === "variable"
      ? "platform"
      : "runtime";
  return buildURN(module, "default", resource.kind, resource.id);
}

/**
 * Diff desired resources against current state, returning changes grouped
 * into dependency levels. Each level can be executed concurrently; levels
 * are sequential. Removals are placed in the final level.
 */
export function plan(
  desired: Resource[],
  current: StateEntry[],
  taintedIds?: Set<string>,
): Change[][] {
  const currentMap = new Map<string, StateEntry>();
  for (const entry of current) {
    currentMap.set(entry.urn, entry);
  }

  const changeByUrn = new Map<string, Change>();
  const removes: Change[] = [];
  const seen = new Set<string>();

  for (const resource of desired) {
    const urn = resourceURN(resource);
    seen.add(urn);
    const prev = currentMap.get(urn);

    if (!prev) {
      changeByUrn.set(urn, { status: "create", resource });
    } else {
      const isTainted = taintedIds?.has(resource.id);
      const configChanged = prev.fingerprint !== fingerprint(resource);

      if (configChanged || isTainted) {
        changeByUrn.set(urn, {
          status: "modify",
          resource,
          ...(!isTainted && prev.inputs != null
            ? { previous: prev.inputs }
            : {}),
        });
      }
    }
  }

  for (const entry of current) {
    if (!seen.has(entry.urn)) {
      removes.push({ status: "remove", urn: entry.urn });
    }
  }

  if (changeByUrn.size === 0 && removes.length === 0) return [];

  // Order creates/modifies by dependency level
  const graph = buildGraph(desired);
  validate(graph);
  const resourceLevels = levels(graph);

  const result: Change[][] = [];
  for (const level of resourceLevels) {
    const levelChanges: Change[] = [];
    for (const resource of level) {
      const urn = resourceURN(resource);
      const change = changeByUrn.get(urn);
      if (change) levelChanges.push(change);
    }
    if (levelChanges.length > 0) result.push(levelChanges);
  }

  if (removes.length > 0) result.push(removes);

  return result;
}
