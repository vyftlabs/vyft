import { isOutput, type OutputRef } from "./output.ts";
import { registry } from "./registry.ts";
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

function hasOutputs(expressions: unknown[]): boolean {
  return expressions.some((expr) => isOutput(expr));
}

export function interpolate(
  strings: TemplateStringsArray,
  ...expressions: unknown[]
): string {
  if (hasOutputs(expressions)) {
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
  if (hasOutputs(expressions)) {
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

function resolveOutputValue(
  output: OutputRef,
  outputs: Record<string, unknown>,
): unknown {
  const urn = registry.urnOf(output);
  const outputData = outputs[urn];
  if (outputData === undefined) {
    throw new Error(`Unresolved output: ${urn}.${output.path}`);
  }
  const parts = output.path.split(".");
  let value: unknown = outputData;
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
      if (isOutput(expr)) {
        result += String(resolveOutputValue(expr, outputs));
      } else {
        result += resolveExpression(expr);
      }
    }
  }
  return result;
}
