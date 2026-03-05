import type {
  EnvValue,
  Interpolation,
  OutputRef,
  VariableRef,
} from "@vyft/primitives";

/** Options for resolving environment values. */
export interface ResolveOptions {
  secrets: ReadonlyMap<string, string>;
  providerOutputs?: ReadonlyMap<string, string>;
}

function isResolveOptions(v: unknown): v is ResolveOptions {
  return typeof v === "object" && v !== null && "secrets" in v;
}

/** Resolve an EnvValue to a concrete string. */
export function resolve(
  value: EnvValue,
  secretsOrOptions: ReadonlyMap<string, string> | ResolveOptions,
): string {
  const options: ResolveOptions = isResolveOptions(secretsOrOptions)
    ? secretsOrOptions
    : { secrets: secretsOrOptions };

  if (typeof value === "string") return value;

  const kind = (value as { kind: string }).kind;

  if (kind === "variable" || kind === "config") {
    const id = (value as VariableRef).id;
    const resolved = options.secrets.get(id);
    if (resolved === undefined)
      throw new Error(`Variable "${id}" has no resolved value`);
    return resolved;
  }

  if (kind === "secret") {
    return (value as { value: string }).value;
  }

  if (kind === "provider-output") {
    const ref = value as OutputRef;
    const key = `${ref.resourceId}.${ref.property}`;
    const resolved = options.providerOutputs?.get(key);
    if (resolved === undefined)
      throw new Error(
        `Provider output "${ref.resourceId}.${ref.property}" has no resolved value`,
      );
    return resolved;
  }

  const interp = value as Interpolation;
  let result = "";
  for (let i = 0; i < interp.values.length; i++) {
    result += interp.strings[i];
    const v = interp.values[i];
    if (v === undefined) continue;
    result += typeof v === "string" ? v : resolve(v as EnvValue, options);
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
