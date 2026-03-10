import { SECRET } from "./secret.ts";

const OUTPUT: unique symbol = Symbol("vyft.output");

export { OUTPUT };

/** User-facing output reference. T is the type the output resolves to at deploy time. */
export interface Output<T = unknown> {
  readonly [OUTPUT]: true;
  /** @internal phantom type — do not access */
  readonly _type?: T;
}

export interface SecretOutput<T = unknown> extends Output<T> {
  readonly [SECRET]: true;
}

/** Internal type with urn/path/kind — used within core for resolution. */
export interface OutputRef<T = unknown> extends Output<T> {
  readonly urn: string;
  readonly path: string;
  readonly kind: "output" | "secret";
}

export function createOutput<T = unknown>(
  urn: string,
  path: string,
): Output<T> {
  const ref = Object.create(null) as OutputRef<T>;
  Object.defineProperty(ref, OUTPUT, {
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
  Object.defineProperty(ref, "kind", {
    value: "output",
    enumerable: true,
    configurable: false,
  });
  return ref;
}

export function createSecretOutput<T = unknown>(
  urn: string,
  path: string,
): SecretOutput<T> {
  const ref = Object.create(null) as OutputRef<T> & { [SECRET]: true };
  Object.defineProperty(ref, OUTPUT, {
    value: true,
    enumerable: false,
    configurable: false,
  });
  Object.defineProperty(ref, SECRET, {
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
  Object.defineProperty(ref, "kind", {
    value: "secret",
    enumerable: true,
    configurable: false,
  });
  return ref;
}

/** Narrows to OutputRef so internal code can access urn/path/kind. */
export function isOutput(value: unknown): value is OutputRef {
  return (
    typeof value === "object" &&
    value !== null &&
    OUTPUT in value &&
    (value as Record<symbol, unknown>)[OUTPUT] === true
  );
}

function getNestedValue(obj: unknown, path: string): unknown {
  if (path === "") return obj;
  const parts = path.split(".");
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function resolveOutputs(
  data: unknown,
  outputs: Record<string, unknown>,
): unknown {
  if (isOutput(data)) {
    const output = outputs[data.urn];
    if (output === undefined) {
      throw new Error(`Unresolved output: ${data.urn}.${data.path}`);
    }
    return getNestedValue(output, data.path);
  }

  if (Array.isArray(data)) {
    return data.map((item) => resolveOutputs(item, outputs));
  }

  if (typeof data === "object" && data !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      result[key] = resolveOutputs(value, outputs);
    }
    return result;
  }

  return data;
}
