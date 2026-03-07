import type { Change, Entry, State } from "./types.ts";

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
  entry: Entry,
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

  for (const urn of Object.keys(desired.entries)) {
    if (!(urn in current.entries)) {
      creates.push({ urn, action: "create" });
    } else {
      updates.push({ urn, action: "update" });
    }
  }

  for (const urn of Object.keys(current.entries)) {
    if (!(urn in desired.entries)) {
      deletes.push({ urn, action: "delete" });
    }
  }

  const allUrns = new Set([
    ...Object.keys(desired.entries),
    ...Object.keys(current.entries),
  ]);

  const forwardDeps = new Map<string, Set<string>>();
  for (const change of [...creates, ...updates]) {
    const entry = desired.entries[change.urn];
    if (entry) {
      forwardDeps.set(change.urn, collectDeps(change.urn, entry, allUrns));
    }
  }

  const reverseDeps = new Map<string, Set<string>>();
  for (const change of deletes) {
    const entry = current.entries[change.urn];
    if (!entry) continue;
    const deps = collectDeps(change.urn, entry, allUrns);
    for (const dep of deps) {
      const set = reverseDeps.get(dep) ?? new Set<string>();
      set.add(change.urn);
      reverseDeps.set(dep, set);
    }
  }

  for (const change of deletes) {
    if (!reverseDeps.has(change.urn)) reverseDeps.set(change.urn, new Set());
  }

  const deleteSteps = topoSort(deletes, reverseDeps);
  const createUpdateSteps = topoSort([...creates, ...updates], forwardDeps);

  return [...deleteSteps, ...createUpdateSteps];
}
