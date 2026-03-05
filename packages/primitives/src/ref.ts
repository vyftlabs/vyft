/** Deferred reference to a variable value, resolved at deploy time. */
export interface VariableRef {
  readonly kind: "variable";
  readonly id: string;
}

/** @deprecated Use VariableRef instead. */
export type ConfigRef = VariableRef;
/** @deprecated Use VariableRef instead. */
export type SecretRef = VariableRef;

/** Deferred reference to a provider resource output, resolved at deploy time. */
export interface OutputRef {
  readonly kind: "provider-output";
  /** The provider resource ID */
  readonly resourceId: string;
  /** The output property name */
  readonly property: string;
}

/** A value resolved at deploy time. */
export type Reference = VariableRef | OutputRef;

/** A secret value that should be masked in logs and UI. */
export interface SecretValue {
  readonly kind: "secret";
  readonly value: string;
}

/** A template string containing deferred {@link Reference} values. */
export interface Interpolation {
  readonly kind: "interpolation";
  readonly strings: TemplateStringsArray;
  readonly values: readonly (Reference | string)[];
}

/**
 * A value assignable to an environment variable.
 * Strings are used as-is; references and interpolations are resolved at deploy time.
 * Config values can be passed directly — they act as deferred references.
 * SecretValue wraps sensitive strings that should be masked.
 */
export type EnvValue = string | Reference | Interpolation | SecretValue;

/**
 * Tagged template for building strings with config/secret references.
 *
 * @example
 * ```ts
 * const password = config("db-password", { secret: true });
 * const db = service("db", { image: "postgres:17", port: 5432 });
 * const url = interpolate`postgres://user:${password}@${db.host}:5432/mydb`;
 * ```
 */
export function interpolate(
  strings: TemplateStringsArray,
  ...values: (Reference | string | number)[]
): Interpolation {
  return {
    kind: "interpolation",
    strings,
    values: values.map((v) => (typeof v === "number" ? String(v) : v)),
  };
}

export function isReference(value: EnvValue): value is Reference {
  if (typeof value === "string") return false;
  const kind = value.kind as string;
  return (
    kind === "variable" ||
    kind === "config" ||
    kind === "secret" ||
    kind === "provider-output"
  );
}

export function isInterpolation(value: EnvValue): value is Interpolation {
  return typeof value !== "string" && value.kind === "interpolation";
}
