import type { Change, EntryData, State } from "./types.ts";

function collectImplicitDeps(
  data: unknown,
  knownUrns: Set<string>,
): Set<string> {
  const deps = new Set<string>();

  function walk(value: unknown) {
    if (typeof value !== "object" || value === null) return;

    if ("urn" in value) {
      const urn = (value as Record<string, unknown>)["urn"];
      if (typeof urn === "string" && knownUrns.has(urn)) {
        deps.add(urn);
      }
    }

    if (Array.isArray(value)) {
      for (const item of value) walk(item);
    } else {
      for (const v of Object.values(value)) walk(v);
    }
  }

  walk(data);
  return deps;
}

function collectDeps(
  urn: string,
  entry: EntryData,
  knownUrns: Set<string>,
): Set<string> {
  const deps = collectImplicitDeps(entry.input, knownUrns);

  if (entry.dependsOn) {
    for (const dep of entry.dependsOn) {
      if (knownUrns.has(dep.urn)) {
        deps.add(dep.urn);
      }
    }
  }

  deps.delete(urn);
  return deps;
}

function topoSort(
  changes: Change[],
  deps: Map<string, Set<string>>,
): Change[][] {
  const steps: Change[][] = [];
  const placed = new Set<string>();
  const remaining = new Set(changes.map((c) => c.urn));

  while (remaining.size > 0) {
    const step: Change[] = [];

    for (const change of changes) {
      if (!remaining.has(change.urn)) continue;

      const changeDeps = deps.get(change.urn) ?? new Set();
      const unmet = [...changeDeps].filter(
        (d) => remaining.has(d) && !placed.has(d),
      );

      if (unmet.length === 0) {
        step.push(change);
      }
    }

    if (step.length === 0) {
      throw new Error("Circular dependency detected");
    }

    for (const change of step) {
      placed.add(change.urn);
      remaining.delete(change.urn);
    }

    steps.push(step);
  }

  return steps;
}

export function plan(desired: State, current: State): Change[][] {
  const creates: Change[] = [];
  const updates: Change[] = [];
  const deletes: Change[] = [];

  for (const [urn, { urn: _, ...data }] of Object.entries(desired.entries)) {
    if (!(urn in current.entries)) {
      creates.push({ urn, action: "create", new: data });
    } else {
      const currentEntry = current.entries[urn];
      if (currentEntry) {
        const { urn: __, ...oldData } = currentEntry;
        updates.push({ urn, action: "update", old: oldData, new: data });
      }
    }
  }

  for (const [urn, { urn: _, ...data }] of Object.entries(current.entries)) {
    if (!(urn in desired.entries)) {
      deletes.push({ urn, action: "delete", old: data });
    }
  }

  const allUrns = new Set([
    ...Object.keys(desired.entries),
    ...Object.keys(current.entries),
  ]);

  // Build dependency graph from desired entries (for creates/updates)
  const forwardDeps = new Map<string, Set<string>>();
  for (const change of [...creates, ...updates]) {
    if (change.new) {
      forwardDeps.set(change.urn, collectDeps(change.urn, change.new, allUrns));
    }
  }

  // Deletes run in reverse dependency order — dependents first
  const reverseDeps = new Map<string, Set<string>>();
  for (const change of deletes) {
    if (!change.old) continue;
    const deps = collectDeps(change.urn, change.old, allUrns);
    // Reverse: if A depends on B, A must be deleted before B
    // So B's reverse dep is A
    for (const dep of deps) {
      const set = reverseDeps.get(dep) ?? new Set<string>();
      set.add(change.urn);
      reverseDeps.set(dep, set);
    }
  }
  // Ensure all deletes have an entry in the map
  for (const change of deletes) {
    if (!reverseDeps.has(change.urn)) reverseDeps.set(change.urn, new Set());
  }

  const deleteSteps = topoSort(deletes, reverseDeps);
  const createUpdateSteps = topoSort([...creates, ...updates], forwardDeps);

  // Deletes first, then creates/updates
  return [...deleteSteps, ...createUpdateSteps];
}
