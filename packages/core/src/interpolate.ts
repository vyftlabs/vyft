import { isRef, type Ref } from "./ref.ts";
import { isSecret, SECRET, unwrap } from "./secret.ts";

const DEFERRED: unique symbol = Symbol("vyft.deferred");

export { DEFERRED };

export interface DeferredTemplate {
  [DEFERRED]: true;
  strings: readonly string[];
  expressions: unknown[];
}

export interface SecretDeferredTemplate extends DeferredTemplate {
  [SECRET]: true;
}

export function isDeferred(value: unknown): value is DeferredTemplate {
  return (
    typeof value === "object" &&
    value !== null &&
    DEFERRED in value &&
    (value as Record<symbol, unknown>)[DEFERRED] === true
  );
}

function resolveExpression(expr: unknown): string {
  if (isSecret(expr)) return String(unwrap(expr));
  return String(expr);
}

function hasRefs(expressions: unknown[]): boolean {
  return expressions.some((expr) => isRef(expr));
}

export function interpolate(
  strings: TemplateStringsArray,
  ...expressions: unknown[]
): string {
  if (hasRefs(expressions)) {
    return {
      [DEFERRED]: true,
      strings: [...strings],
      expressions,
    } as unknown as string;
  }

  let result = "";
  for (let i = 0; i < strings.length; i++) {
    result += strings[i];
    if (i < expressions.length) {
      result += resolveExpression(expressions[i]);
    }
  }
  return result;
}

interpolate.secret = function secretInterpolate(
  strings: TemplateStringsArray,
  ...expressions: unknown[]
): string {
  if (hasRefs(expressions)) {
    return {
      [DEFERRED]: true,
      [SECRET]: true,
      strings: [...strings],
      expressions,
    } as unknown as string;
  }

  let result = "";
  for (let i = 0; i < strings.length; i++) {
    result += strings[i];
    if (i < expressions.length) {
      result += resolveExpression(expressions[i]);
    }
  }

  const wrapper = Object(result);
  Object.defineProperty(wrapper, SECRET, {
    value: true,
    enumerable: false,
    configurable: false,
  });
  Object.defineProperty(wrapper, "value", {
    value: result,
    enumerable: false,
    configurable: false,
  });
  return wrapper as unknown as string;
};

function resolveRefValue(ref: Ref, outputs: Record<string, unknown>): unknown {
  const output = outputs[ref.urn];
  if (output === undefined) {
    throw new Error(`Unresolved ref: ${ref.urn}.${ref.path}`);
  }
  const parts = ref.path.split(".");
  let value: unknown = output;
  for (const part of parts) {
    if (value === null || value === undefined) break;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

export function resolveDeferred(
  template: DeferredTemplate,
  outputs: Record<string, unknown>,
): string {
  let result = "";
  for (let i = 0; i < template.strings.length; i++) {
    result += template.strings[i];
    if (i < template.expressions.length) {
      const expr = template.expressions[i];
      if (isRef(expr)) {
        result += String(resolveRefValue(expr, outputs));
      } else {
        result += resolveExpression(expr);
      }
    }
  }
  return result;
}
