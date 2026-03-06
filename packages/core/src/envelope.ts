import { type DeferredTemplate, isDeferred } from "./interpolate.ts";
import { isRef, type Ref } from "./ref.ts";
import {
  type Cipher,
  type EncryptedSecret,
  isSecret,
  SECRET,
  unwrap,
} from "./secret.ts";

export interface SerializedRef {
  kind: "ref";
  urn: string;
  path: string;
}

export interface SerializedDeferred {
  kind: "deferred";
  strings: string[];
  expressions: unknown[];
  secret?: boolean;
}

export type Envelope = EncryptedSecret | SerializedRef | SerializedDeferred;

export function isEnvelope(value: unknown): value is Envelope {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    typeof (value as Record<string, unknown>)["kind"] === "string" &&
    ["secret", "ref", "deferred"].includes(
      (value as Record<string, unknown>)["kind"] as string,
    )
  );
}

// ── Resolve (store → plaintext) ─────────────────────────────────────────

function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

async function resolveRef(
  ref: SerializedRef,
  outputs: Record<string, unknown>,
  cipher: Cipher,
): Promise<unknown> {
  const output = outputs[ref.urn];
  if (output === undefined) {
    throw new Error(`Unresolved ref: ${ref.urn}.${ref.path}`);
  }
  const value = getNestedValue(output, ref.path);
  if (isEnvelope(value) && value.kind === "secret") {
    return cipher.decrypt(value);
  }
  return value;
}

async function resolveDeferred(
  deferred: SerializedDeferred,
  outputs: Record<string, unknown>,
  cipher: Cipher,
): Promise<string> {
  let result = "";
  for (let i = 0; i < deferred.strings.length; i++) {
    result += deferred.strings[i];
    if (i < deferred.expressions.length) {
      const expr = deferred.expressions[i];
      const resolved = await resolveValue(expr, outputs, cipher);
      result += String(resolved);
    }
  }
  return result;
}

export async function resolveValue(
  value: unknown,
  outputs: Record<string, unknown>,
  cipher: Cipher,
): Promise<unknown> {
  if (isEnvelope(value)) {
    switch (value.kind) {
      case "secret":
        return cipher.decrypt(value);
      case "ref":
        return resolveRef(value, outputs, cipher);
      case "deferred":
        return resolveDeferred(value, outputs, cipher);
    }
  }

  if (Array.isArray(value)) {
    return Promise.all(
      value.map((item) => resolveValue(item, outputs, cipher)),
    );
  }

  if (typeof value === "object" && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = await resolveValue(val, outputs, cipher);
    }
    return result;
  }

  return value;
}

// ── Seal (in-memory brands → serialized envelopes) ──────────────────────

function sealRef(ref: Ref): SerializedRef {
  return { kind: "ref", urn: ref.urn, path: ref.path };
}

function sealDeferred(deferred: DeferredTemplate): SerializedDeferred {
  const sealed: SerializedDeferred = {
    kind: "deferred",
    strings: [...deferred.strings],
    expressions: deferred.expressions.map((expr) => sealValue(expr)),
  };
  if (SECRET in deferred) {
    sealed.secret = true;
  }
  return sealed;
}

function sealValue(value: unknown): unknown {
  if (isRef(value)) {
    return sealRef(value);
  }

  if (isDeferred(value)) {
    return sealDeferred(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sealValue(item));
  }

  if (typeof value === "object" && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = sealValue(val);
    }
    return result;
  }

  return value;
}

async function sealSecretValue(
  value: unknown,
  cipher: Cipher,
): Promise<unknown> {
  if (isSecret(value)) {
    const plaintext = String(unwrap(value));
    return cipher.encrypt(plaintext);
  }

  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => sealSecretValue(item, cipher)));
  }

  if (typeof value === "object" && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = await sealSecretValue(val, cipher);
    }
    return result;
  }

  return value;
}

export function sealInput(
  input: Record<string, unknown>,
): Record<string, unknown> {
  return sealValue(input) as Record<string, unknown>;
}

export async function sealOutput(
  output: Record<string, unknown>,
  cipher: Cipher,
): Promise<Record<string, unknown>> {
  return sealSecretValue(output, cipher) as Promise<Record<string, unknown>>;
}
