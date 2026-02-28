/** Deferred reference to a secret, resolved at deploy time. */
export interface SecretRef {
  readonly kind: "secret";
  readonly id: string;
}

/** A value resolved at deploy time. Currently only secrets. */
export type Reference = SecretRef;

/** A template string containing deferred {@link Reference} values. */
export interface Interpolation {
  readonly kind: "interpolation";
  readonly strings: TemplateStringsArray;
  readonly values: readonly (Reference | string)[];
}

/**
 * A value assignable to an environment variable.
 * Strings are used as-is; references and interpolations are resolved at deploy time.
 * Secrets can be passed directly — they act as deferred references.
 */
export type EnvValue = string | Reference | Interpolation;

/**
 * Tagged template for building strings with secret references.
 *
 * @example
 * ```ts
 * const password = secret("db-password");
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
  return typeof value !== "string" && value.kind === "secret";
}

export function isInterpolation(value: EnvValue): value is Interpolation {
  return typeof value !== "string" && value.kind === "interpolation";
}
