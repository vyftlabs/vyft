import type { DiffArgs, DiffResult } from "./resource.ts";

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === "object") {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    // Filter out undefined values — JSON roundtrip strips them
    const aKeys = Object.keys(aObj).filter((k) => aObj[k] !== undefined);
    const bKeys = Object.keys(bObj).filter((k) => bObj[k] !== undefined);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((k) => k in bObj && deepEqual(aObj[k], bObj[k]));
  }
  return false;
}

/**
 * Default diff for create-only resources: returns "none" if inputs are
 * deeply equal, "recreate" otherwise.
 */
export function inputDiff(args: DiffArgs<unknown>): Promise<DiffResult> {
  const action = deepEqual(args.old, args.new) ? "none" : "recreate";
  return Promise.resolve({ action });
}
