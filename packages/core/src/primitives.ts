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

export interface ConfigOptions {
  /** Mark this config value as a secret (encrypted at rest). */
  secret?: boolean;
  /** Whether the secret is auto-generated. Only relevant when `secret: true`. @default true */
  generated?: boolean;
  /** Output length for generated secrets. @default 32 */
  length?: number;
  /** Character set for generated secrets. Must have at least 2 characters. */
  alphabet?: string;
}
