export const SECRET: unique symbol = Symbol("vyft.secret");

interface SecretValue<T> {
  [SECRET]: true;
  value: T;
}

function wrapSecret<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    Object.defineProperty(value, SECRET, {
      value: true,
      enumerable: false,
      configurable: false,
    });
    return value;
  }

  const wrapper = Object(value) as SecretValue<T>;
  Object.defineProperty(wrapper, SECRET, {
    value: true,
    enumerable: false,
    configurable: false,
  });
  Object.defineProperty(wrapper, "value", {
    value,
    enumerable: false,
    configurable: false,
  });
  return wrapper as unknown as T;
}

function taggedTemplate(
  strings: TemplateStringsArray,
  ...expressions: unknown[]
): string {
  let result = "";
  for (let i = 0; i < strings.length; i++) {
    result += strings[i];
    if (i < expressions.length) {
      const expr = expressions[i];
      result += String(isSecret(expr) ? unwrap(expr) : expr);
    }
  }
  return wrapSecret(result) as unknown as string;
}

export function secret<T>(value: T): T;
export function secret(
  strings: TemplateStringsArray,
  ...expressions: unknown[]
): string;
export function secret(first: unknown, ...rest: unknown[]): unknown {
  if (
    typeof first === "object" &&
    first !== null &&
    "raw" in first &&
    Array.isArray((first as TemplateStringsArray).raw)
  ) {
    return taggedTemplate(first as TemplateStringsArray, ...rest);
  }
  return wrapSecret(first);
}

export function isSecret(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    SECRET in value &&
    (value as Record<symbol, unknown>)[SECRET] === true
  );
}

export function unwrap<T>(value: T): T {
  if (!isSecret(value)) return value;
  const wrapper = value as unknown as SecretValue<T>;
  if (
    "value" in wrapper &&
    !Object.prototype.propertyIsEnumerable.call(wrapper, "value")
  ) {
    return wrapper.value;
  }
  return value;
}
