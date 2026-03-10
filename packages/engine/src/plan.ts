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
