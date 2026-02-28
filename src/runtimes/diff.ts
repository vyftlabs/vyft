import { serializeConfig } from "../engine/plan.ts";

// These fields only exist on ServiceConfig. CronJobConfig has no non-spec fields.
// When adding a non-spec config field to any resource type, update this set.
export const NON_SPEC_FIELDS: ReadonlySet<string> = new Set([
  "route",
  "replicas",
  "dev",
  "dependsOn",
]);

/**
 * Compare previous serialized config against current resource config.
 * Returns the set of top-level config keys that differ.
 *
 * `previous` comes from StateEntry.inputs (already JSON-roundtripped with
 * resourceReplacer). `config` is the live resource config object — it's
 * serialized through serializeConfig before comparison so nested resources
 * are replaced by ID strings, matching the format of `previous`.
 *
 * Both `previous` (from StateEntry.inputs) and `current` (from serializeConfig)
 * went through the same `JSON.parse(JSON.stringify(..., resourceReplacer))`
 * pipeline — insertion order is preserved through JSON round-trips, so
 * `JSON.stringify` produces identical output for identical data.
 *
 * Note: array comparisons are order-sensitive (JSON.stringify of arrays depends
 * on element order), so reordered arrays like `dependsOn` will appear in the
 * changed set — this is harmless because `dependsOn` is in NON_SPEC_FIELDS.
 */
export function changedFields(
  previous: Record<string, unknown>,
  config: object,
): Set<string> {
  const current = serializeConfig(config);
  const changed = new Set<string>();

  // Union of keys from both sides to catch added and removed fields
  const allKeys = new Set([...Object.keys(previous), ...Object.keys(current)]);

  for (const key of allKeys) {
    if (JSON.stringify(previous[key]) !== JSON.stringify(current[key])) {
      changed.add(key);
    }
  }

  return changed;
}

/**
 * Returns true if any field in `changed` is NOT in the non-spec set.
 * New/unknown config fields default to spec — the safer assumption.
 */
export function hasSpecChange(changed: Set<string>): boolean {
  for (const field of changed) {
    if (!NON_SPEC_FIELDS.has(field)) return true;
  }
  return false;
}
