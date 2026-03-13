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
      if (knownUrns.has(dep)) {
        deps.add(dep);
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
  // Standard ASAP topo sort first
  const asapSteps: Change[][] = [];
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

    asapSteps.push(step);
  }

  if (asapSteps.length <= 1) return asapSteps;

  // Build reverse dependency map (urn → set of urns that depend on it)
  const reverseDeps = new Map<string, Set<string>>();
  for (const [urn, d] of deps) {
    for (const dep of d) {
      let rev = reverseDeps.get(dep);
      if (!rev) {
        rev = new Set();
        reverseDeps.set(dep, rev);
      }
      rev.add(urn);
    }
  }

  // Record each URN's ASAP step index
  const asapStep = new Map<string, number>();
  for (let i = 0; i < asapSteps.length; i++) {
    const step = asapSteps[i];
    if (!step) continue;
    for (const change of step) {
      asapStep.set(change.urn, i);
    }
  }

  // Compute ALAP step: latest step each resource can be in
  // Constrained by: must be before all dependents (reverse deps)
  const alapStep = new Map<string, number>();
  const lastIdx = asapSteps.length - 1;

  // Process in reverse topo order so dependents are resolved first
  for (let i = lastIdx; i >= 0; i--) {
    const step = asapSteps[i];
    if (!step) continue;
    for (const change of step) {
      const rev = reverseDeps.get(change.urn);
      if (!rev || rev.size === 0) {
        alapStep.set(change.urn, lastIdx);
      } else {
        let latest = lastIdx;
        for (const dependent of rev) {
          const depStep =
            alapStep.get(dependent) ?? asapStep.get(dependent) ?? 0;
          latest = Math.min(latest, depStep - 1);
        }
        alapStep.set(
          change.urn,
          Math.max(latest, asapStep.get(change.urn) ?? 0),
        );
      }
    }
  }

  // Rebuild steps using ALAP placement
  const result: Change[][] = [];
  for (let i = 0; i <= lastIdx; i++) {
    result.push([]);
  }
  for (const change of changes) {
    const step = alapStep.get(change.urn) ?? 0;
    result[step]?.push(change);
  }

  return result.filter((s) => s.length > 0);
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

  const allChanges = [...creates, ...updates, ...deletes];
  const actionOf = new Map<string, Change["action"]>();
  for (const c of allChanges) actionOf.set(c.urn, c.action);

  const deps = new Map<string, Set<string>>();
  for (const c of allChanges) deps.set(c.urn, new Set());

  for (const change of allChanges) {
    const entry =
      change.action === "delete"
        ? current.entries[change.urn]
        : desired.entries[change.urn];
    if (!entry) continue;

    const rawDeps = collectDeps(change.urn, entry, allUrns);

    for (const dep of rawDeps) {
      const depAction = actionOf.get(dep);
      if (!depAction) continue;

      if (change.action !== "delete") {
        if (depAction !== "delete") {
          // create/update depends on create/update: dep must come first
          deps.get(change.urn)?.add(dep);
        } else {
          // create/update depends on a resource being deleted:
          // the deletion must happen after this update
          deps.get(dep)?.add(change.urn);
        }
      } else {
        if (depAction === "delete") {
          // delete depends on delete: dependent must be deleted before dependency
          deps.get(dep)?.add(change.urn);
        }
        // delete depending on create/update: no ordering constraint needed
      }
    }
  }

  return topoSort(allChanges, deps);
}
