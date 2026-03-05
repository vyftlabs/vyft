import type { Resource, URN } from "@vyft/primitives";
import { INTERNAL, MOUNTABLE, parseURN } from "@vyft/primitives";
import type { ResourceState } from "@vyft/store";
import { buildGraph } from "./graph.ts";
import { levels } from "./order.ts";
import { fingerprint, resourceURN } from "./plan.ts";
import { validate } from "./validate.ts";

/** Lifecycle operation — mirrors LifecycleHandlers methods. */
export type LifecycleOp =
  | { action: "create"; urn: URN; input: unknown }
  | { action: "update"; urn: URN; input: unknown; previous?: unknown }
  | { action: "delete"; urn: URN };

/**
 * Hydrate a ResourceState entry back into a Resource object.
 * Key invariant: fingerprint(hydrate(entry)) === entry.fingerprint
 */
export function hydrate(entry: ResourceState): Resource {
  const { module, provider, resource: resourceType, id } = parseURN(entry.urn);

  const base = { id, urn: entry.urn };

  if (module === "provider") {
    return {
      kind: "provider",
      ...base,
      provider,
      type: resourceType,
      input: entry.inputs,
      output: entry.outputs,
    };
  }

  // Map resource type back to kind
  const config = entry.inputs;
  switch (resourceType) {
    case "volume":
      return {
        kind: "volume",
        ...base,
        config,
        [MOUNTABLE]: true,
      } as unknown as Resource;
    case "variable":
      return {
        kind: "variable",
        ...base,
        config,
      } as unknown as Resource;
    case "service": {
      const port = (config as Record<string, unknown>)?.["port"] ?? 3000;
      return {
        kind: "service",
        ...base,
        config,
        host: id,
        port,
        url: `http://${id}:${port}`,
        [INTERNAL]: { ready: undefined },
      } as unknown as Resource;
    }
    case "job":
      return {
        kind: "job",
        ...base,
        config,
        [INTERNAL]: { ready: undefined },
      } as unknown as Resource;
    case "cronjob":
      return {
        kind: "cronjob",
        ...base,
        config,
      } as unknown as Resource;
    default:
      // Unknown resource type — treat as volume-like
      return {
        kind: "volume",
        ...base,
        config,
        [MOUNTABLE]: true,
      } as unknown as Resource;
  }
}

/** Immutable state builder for computing lifecycle operations. */
export class State {
  private readonly entries: ReadonlyMap<string, ResourceState>;
  private readonly added: readonly Resource[];
  private readonly tainted: ReadonlySet<string>;
  private readonly updates: ReadonlyMap<
    string,
    (config: Record<string, unknown>) => Record<string, unknown>
  >;
  private readonly removed: ReadonlySet<string>;

  constructor(
    entries: ReadonlyMap<string, ResourceState>,
    added: readonly Resource[] = [],
    tainted: ReadonlySet<string> = new Set(),
    updates: ReadonlyMap<
      string,
      (config: Record<string, unknown>) => Record<string, unknown>
    > = new Map(),
    removed: ReadonlySet<string> = new Set(),
  ) {
    this.entries = entries;
    this.added = added;
    this.tainted = tainted;
    this.updates = updates;
    this.removed = removed;
  }

  /** Get a resource state entry by URN. */
  get(urn: URN): ResourceState | undefined {
    return this.entries.get(urn);
  }

  /** Check if a URN exists in state. */
  has(urn: URN): boolean {
    return this.entries.has(urn);
  }

  /** List all entries, optionally filtered by resource type from parsed URN. */
  list(resourceType?: string): ResourceState[] {
    const result: ResourceState[] = [];
    for (const entry of this.entries.values()) {
      if (resourceType) {
        const parsed = parseURN(entry.urn);
        if (parsed.resource !== resourceType) continue;
      }
      result.push(entry);
    }
    return result;
  }

  /** Return new State with updated config for a resource. */
  update(
    urn: URN,
    fn: (config: Record<string, unknown>) => Record<string, unknown>,
  ): State {
    const newUpdates = new Map(this.updates);
    newUpdates.set(urn, fn);
    return new State(
      this.entries,
      this.added,
      this.tainted,
      newUpdates,
      this.removed,
    );
  }

  /** Return new State with a resource marked for removal. */
  remove(urn: URN): State {
    const newRemoved = new Set(this.removed);
    newRemoved.add(urn);
    return new State(
      this.entries,
      this.added,
      this.tainted,
      this.updates,
      newRemoved,
    );
  }

  /** Return new State with a new resource added. */
  add(resource: Resource): State {
    return new State(
      this.entries,
      [...this.added, resource],
      this.tainted,
      this.updates,
      this.removed,
    );
  }

  /** Return new State with a resource tainted (forces recreate). */
  taint(urn: URN): State {
    const newTainted = new Set(this.tainted);
    newTainted.add(urn);
    return new State(
      this.entries,
      this.added,
      newTainted,
      this.updates,
      this.removed,
    );
  }

  /** Build lifecycle operations from state diffs. */
  build(): LifecycleOp[][] {
    // 1. Hydrate existing entries, apply updates, exclude removed
    const desired: Resource[] = [];
    const previousByUrn = new Map<string, ResourceState>();

    for (const [urn, entry] of this.entries) {
      if (this.removed.has(urn)) continue;
      previousByUrn.set(urn, entry);

      let resource = hydrate(entry);
      const updateFn = this.updates.get(urn);
      if (updateFn) {
        // Apply the update function to the config/input
        if (resource.kind === "provider") {
          const newInput = updateFn(resource.input as Record<string, unknown>);
          resource = { ...resource, input: newInput };
        } else {
          const newConfig = updateFn(
            (resource as unknown as { config: Record<string, unknown> }).config,
          );
          resource = {
            ...(resource as unknown as Record<string, unknown>),
            config: newConfig,
          } as unknown as Resource;
        }
      }
      desired.push(resource);
    }

    // 2. Add new resources
    for (const resource of this.added) {
      desired.push(resource);
    }

    // 3. Build graph, validate, get levels
    const graph = buildGraph(desired);
    validate(graph);
    const resourceLevels = levels(graph);

    // 4. Compare fingerprints and generate ops
    const allOps: LifecycleOp[][] = [];

    // Deletions first (reversed order — dependents before dependencies)
    const deleteOps: LifecycleOp[] = [];
    for (const urn of this.removed) {
      deleteOps.push({ action: "delete", urn: urn as URN });
    }
    if (deleteOps.length > 0) {
      allOps.push(deleteOps);
    }

    // Creates and updates grouped by level
    for (const level of resourceLevels) {
      const levelOps: LifecycleOp[] = [];

      for (const resource of level) {
        const urn = resourceURN(resource);
        const prev = previousByUrn.get(urn);
        const isTainted = this.tainted.has(urn);

        if (!prev) {
          // New resource
          const input =
            resource.kind === "provider" ? resource.input : resource.config;
          levelOps.push({ action: "create", urn, input });
        } else {
          const fp = fingerprint(resource);
          if (fp !== prev.fingerprint || isTainted) {
            const input =
              resource.kind === "provider" ? resource.input : resource.config;
            levelOps.push({
              action: "update",
              urn,
              input,
              ...(!isTainted ? { previous: prev.inputs } : {}),
            });
          }
        }
      }

      if (levelOps.length > 0) {
        allOps.push(levelOps);
      }
    }

    return allOps;
  }
}

/** Create a State builder from previous resource state. */
export function transform(
  previous: ReadonlyMap<string, ResourceState> | ResourceState[],
): State {
  if (Array.isArray(previous)) {
    const entries = new Map<string, ResourceState>();
    for (const entry of previous) {
      entries.set(entry.urn, entry);
    }
    return new State(entries);
  }
  return new State(previous);
}
