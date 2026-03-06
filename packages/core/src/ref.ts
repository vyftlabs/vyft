import { SECRET } from "./secret.ts";

const REF: unique symbol = Symbol("vyft.ref");

export { REF };

export interface Ref<T = unknown> {
  [REF]: true;
  readonly urn: string;
  readonly path: string;
  readonly _type?: T;
}

export interface SecretRef<T = unknown> extends Ref<T> {
  [SECRET]: true;
}

export function createRef<T = unknown>(urn: string, path: string): Ref<T> {
  const ref = Object.create(null) as Ref<T>;
  Object.defineProperty(ref, REF, {
    value: true,
    enumerable: false,
    configurable: false,
  });
  Object.defineProperty(ref, "urn", {
    value: urn,
    enumerable: true,
    configurable: false,
  });
  Object.defineProperty(ref, "path", {
    value: path,
    enumerable: true,
    configurable: false,
  });
  return ref;
}

export function createSecretRef<T = unknown>(
  urn: string,
  path: string,
): SecretRef<T> {
  const ref = createRef<T>(urn, path) as SecretRef<T>;
  Object.defineProperty(ref, SECRET, {
    value: true,
    enumerable: false,
    configurable: false,
  });
  return ref;
}

export function isRef(value: unknown): value is Ref {
  return (
    typeof value === "object" &&
    value !== null &&
    REF in value &&
    (value as Record<symbol, unknown>)[REF] === true
  );
}

function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function resolveRefs(
  data: unknown,
  outputs: Record<string, unknown>,
): unknown {
  if (isRef(data)) {
    const output = outputs[data.urn];
    if (output === undefined) {
      throw new Error(`Unresolved ref: ${data.urn}.${data.path}`);
    }
    return getNestedValue(output, data.path);
  }

  if (Array.isArray(data)) {
    return data.map((item) => resolveRefs(item, outputs));
  }

  if (typeof data === "object" && data !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      result[key] = resolveRefs(value, outputs);
    }
    return result;
  }

  return data;
}
