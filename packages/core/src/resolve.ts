import type { ConfigRef, EnvValue, OutputRef } from "./ref.ts";

/** Options for resolving environment values. */
export interface ResolveOptions {
  /** Config/secret values by ID */
  secrets: ReadonlyMap<string, string>;
  /** Provider resource outputs by "{resourceId}.{property}" */
  providerOutputs?: ReadonlyMap<string, string>;
}

function isResolveOptions(v: unknown): v is ResolveOptions {
  return typeof v === "object" && v !== null && "secrets" in v;
}

/** Resolve an EnvValue to a concrete string using a lookup table. */
export function resolve(
  value: EnvValue,
  secretsOrOptions: ReadonlyMap<string, string> | ResolveOptions,
): string {
  // Normalize options
  const options: ResolveOptions = isResolveOptions(secretsOrOptions)
    ? secretsOrOptions
    : { secrets: secretsOrOptions };

  if (typeof value === "string") return value;

  if (value.kind === "config") {
    const resolved = options.secrets.get(value.id);
    if (resolved === undefined) {
      throw new Error(`Config "${value.id}" has no resolved value`);
    }
    return resolved;
  }

  if (value.kind === "secret") {
    return value.value;
  }

  if (value.kind === "provider-output") {
    const ref = value as OutputRef;
    const key = `${ref.resourceId}.${ref.property}`;
    const resolved = options.providerOutputs?.get(key);
    if (resolved === undefined) {
      throw new Error(
        `Provider output "${ref.resourceId}.${ref.property}" has no resolved value`,
      );
    }
    return resolved;
  }

  // Interpolation — stitch strings and resolved values together
  let result = "";
  for (let i = 0; i < value.values.length; i++) {
    result += value.strings[i];
    const v = value.values[i];
    if (v === undefined) continue;
    result += typeof v === "string" ? v : resolve(v, options);
  }
  result += value.strings[value.strings.length - 1] ?? "";
  return result;
}

/**
 * Resolve an EnvValue that may have a legacy `kind: "secret"` reference.
 * Used when processing data that may come from old state files.
 */
export function resolveCompat(
  value: EnvValue | { kind: "secret"; id: string },
  secrets: ReadonlyMap<string, string>,
): string {
  if (typeof value === "string") return value;
  const kind = (value as { kind: string }).kind;
  if (kind === "config" || kind === "secret") {
    const id = (value as ConfigRef).id;
    const resolved = secrets.get(id);
    if (resolved === undefined) {
      throw new Error(`Config "${id}" has no resolved value`);
    }
    return resolved;
  }
  // Interpolation or OutputRef - pass through to main resolver
  return resolve(value as EnvValue, secrets);
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
