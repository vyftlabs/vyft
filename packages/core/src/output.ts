import { SECRET } from "./secret.ts";

const OUTPUT: unique symbol = Symbol("vyft.output");

export { OUTPUT };

export interface Output {
  [OUTPUT]: true;
  readonly urn: string;
  readonly path: string;
  readonly kind: "output";
}

export interface SecretOutput {
  [OUTPUT]: true;
  [SECRET]: true;
  readonly urn: string;
  readonly path: string;
  readonly kind: "secret";
}

export function createOutput(urn: string, path: string): Output {
  const ref = Object.create(null) as Output;
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

export function createSecretOutput(urn: string, path: string): SecretOutput {
  const ref = Object.create(null) as SecretOutput;
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

export function isOutput(value: unknown): value is Output {
  return (
    typeof value === "object" &&
    value !== null &&
    OUTPUT in value &&
    (value as Record<symbol, unknown>)[OUTPUT] === true
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
