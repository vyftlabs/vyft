import type { URN } from "@vyft/primitives";
import type { WALEntry } from "@vyft/store";
import { fingerprint as coreFingerprint } from "./plan.ts";
import type { LifecycleOp } from "./transform.ts";
import { hydrate } from "./transform.ts";

export type { WALEntry } from "@vyft/store";

/** Handler result from a dispatcher call. */
export interface HandlerResult {
  outputs?: Record<string, unknown>;
}

/**
 * Single dispatcher function.
 * Receives an op with fully resolved config (env values are plain strings).
 */
export type Dispatcher = (op: LifecycleOp) => Promise<HandlerResult>;

/**
 * Resolve function: look up a resource output by URN + key, decrypting if needed.
 * The caller builds this closure over state + passphrase.
 */
export type Resolve = (urn: URN, key: string) => unknown;

function actionToWAL(
  action: LifecycleOp["action"],
): "creating" | "updating" | "deleting" {
  switch (action) {
    case "create":
      return "creating";
    case "update":
      return "updating";
    case "delete":
      return "deleting";
  }
}

/**
 * Apply a single lifecycle operation, yielding WAL entries.
 *
 * - Resolves env references in op.input via `resolve(urn, key)` before dispatching
 * - Calls dispatcher with resolved config
 * - Yields raw WAL entries (pending, committed with inputs+outputs, or removed)
 * - The Store's replay() builds full ResourceState from committed entries
 */
export async function* apply(
  op: LifecycleOp,
  dispatcher: Dispatcher,
  resolve: Resolve,
): AsyncGenerator<WALEntry> {
  // 1. Yield pending
  yield {
    type: "pending",
    urn: op.urn,
    action: actionToWAL(op.action),
  };

  if (op.action === "delete") {
    await dispatcher(op);
    yield { type: "removed", urn: op.urn };
  } else {
    // Resolve env references before dispatching
    const input = resolveInput(op.input, resolve);
    const resolved = { ...op, input };

    const result = await dispatcher(resolved);

    const inputs =
      input && typeof input === "object"
        ? (input as Record<string, unknown>)
        : {};

    const outputs = result.outputs ?? {};

    // Compute fingerprint via hydrate for round-trip consistency with transform
    const stub = {
      urn: op.urn,
      fingerprint: "",
      inputs,
      outputs,
      dependencies: [],
      created: "",
      modified: "",
      taint: false,
    };
    const fp = coreFingerprint(hydrate(stub));

    yield {
      type: "committed",
      urn: op.urn,
      fingerprint: fp,
      inputs,
      outputs,
    };
  }
}

/**
 * Walk the input config and resolve env values that reference other resources.
 * Returns a new config with all references replaced by concrete values.
 */
function resolveInput(input: unknown, resolve: Resolve): unknown {
  if (!input || typeof input !== "object") return input;

  const config = input as Record<string, unknown>;
  if (!config["env"]) return input;

  const env = config["env"] as Record<string, unknown>;
  const resolved: Record<string, string> = {};

  for (const [key, value] of Object.entries(env)) {
    resolved[key] = resolveValue(value, resolve);
  }

  return { ...config, env: resolved };
}

function resolveValue(value: unknown, resolve: Resolve): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return String(value ?? "");

  const ref = value as {
    kind?: string;
    id?: string;
    resourceId?: string;
    property?: string;
    strings?: string[];
    values?: unknown[];
  };

  if (ref.kind === "variable" || ref.kind === "config") {
    return String(
      resolve(`urn:vyft:platform:default:variable:${ref.id}` as URN, "value"),
    );
  }

  if (ref.kind === "secret") {
    return (value as { value: string }).value;
  }

  if (ref.kind === "provider-output") {
    return String(
      resolve(
        `urn:vyft:provider:${ref.resourceId}:unknown:${ref.resourceId}` as URN,
        ref.property as string,
      ),
    );
  }

  // Interpolation
  if (ref.strings && ref.values) {
    let result = "";
    for (let i = 0; i < ref.values.length; i++) {
      result += ref.strings[i] ?? "";
      const v = ref.values[i];
      if (v === undefined) continue;
      result += typeof v === "string" ? v : resolveValue(v, resolve);
    }
    result += ref.strings[ref.strings.length - 1] ?? "";
    return result;
  }

  return String(value);
}
