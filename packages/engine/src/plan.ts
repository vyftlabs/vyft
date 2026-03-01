import type { Change, Resource, StateEntry } from "@vyft/core";
import { fingerprint } from "@vyft/core";

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
