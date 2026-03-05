import type { EnvValue, Interpolation, VariableRef } from "@vyft/primitives";

/** Resolve an EnvValue to a concrete string. */
export function resolve(
  value: EnvValue,
  secrets: ReadonlyMap<string, string>,
): string {
  if (typeof value === "string") return value;

  const kind = (value as { kind: string }).kind;

  if (kind === "variable" || kind === "config") {
    const id = (value as VariableRef).id;
    const resolved = secrets.get(id);
    if (resolved === undefined)
      throw new Error(`Variable "${id}" has no resolved value`);
    return resolved;
  }

  if (kind === "secret") {
    return (value as { value: string }).value;
  }

  // Interpolation
  const interp = value as Interpolation;
  let result = "";
  for (let i = 0; i < interp.values.length; i++) {
    result += interp.strings[i];
    const v = interp.values[i];
    if (v === undefined) continue;
    result += typeof v === "string" ? v : resolve(v as EnvValue, secrets);
  }
  result += interp.strings[interp.strings.length - 1] ?? "";
  return result;
}

/** Resolve a full env record to plain strings. */
export function resolveEnv(
  env: Readonly<Record<string, EnvValue>>,
  secrets: ReadonlyMap<string, string>,
): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    resolved[key] = resolve(value, secrets);
  }
  return resolved;
}
