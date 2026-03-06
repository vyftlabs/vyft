import type { Change, State } from "./types.ts";

export function plan<T>(desired: State<T>, current: State<T>): Change<T>[][] {
  const changes: Change<T>[] = [];

  for (const [urn, value] of Object.entries(desired.entries)) {
    if (!(urn in current.entries)) {
      changes.push({ urn, action: "create", new: value });
    } else {
      changes.push({
        urn,
        action: "update",
        old: current.entries[urn] as T,
        new: value,
      });
    }
  }

  for (const [urn, value] of Object.entries(current.entries)) {
    if (!(urn in desired.entries)) {
      changes.push({ urn, action: "delete", old: value });
    }
  }

  // TODO: dependency ordering, parallelization
  return changes.map((change) => [change]);
}
