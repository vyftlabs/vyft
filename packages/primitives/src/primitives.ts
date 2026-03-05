import type { Interpolation, Reference } from "./ref.ts";

export type BindValue = string | number | Reference | Interpolation;

export interface Binding {
  readonly kind: "binding";
  readonly value: BindValue;
}

export interface SecretOutput {
  readonly kind: "secret";
  readonly value: string;
}

export interface VariableOptions {
  /** Mark this variable value as a secret (encrypted at rest). */
  secret?: boolean;
  /** Whether the secret is auto-generated. Only relevant when `secret: true`. @default true */
  generated?: boolean;
  /** Output length for generated secrets. @default 32 */
  length?: number;
  /** Character set for generated secrets. Must have at least 2 characters. */
  alphabet?: string;
}

/** @deprecated Use VariableOptions instead. */
export type ConfigOptions = VariableOptions;

export function bindable(value: BindValue): Binding {
  return { kind: "binding", value };
}

export function secret(value: string): SecretOutput {
  return { kind: "secret", value };
}

export function isSecretOutput(value: unknown): value is SecretOutput {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as SecretOutput).kind === "secret"
  );
}
