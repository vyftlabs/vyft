import {
  DEPENDABLE,
  type Dependable,
  LINKABLE,
  type Linkable,
} from "@vyft/engine";
import type { Output } from "./output.ts";
import { createOutput, OUTPUT } from "./output.ts";
import type { Provider } from "./provider.ts";
import { registry } from "./registry.ts";
import type { URN } from "./urn.ts";
import { urn } from "./urn.ts";

export const RESOURCE: unique symbol = Symbol("vyft.resource");

export interface ResourceRef<T = unknown> {
  urn: URN;
  readonly _type?: T;
}

export interface ResourceOptions {
  dependsOn?: Dependable[];
}

export interface ResourceEntry<T = unknown> extends ResourceRef<T> {
  [DEPENDABLE]: true;
  [LINKABLE]: true;
  value: Record<string, unknown>;
  /** Original config before transformation — preserved for tooling (e.g. local dev runner) */
  config?: unknown;
  dependsOn?: Dependable[];
  provider: Provider<unknown>;
}

export type HandlerName = "create" | "read" | "update" | "delete" | "diff";

export interface ArtifactRef {
  key: string;
}

export interface Artifacts {
  write(name: string, data: string | Buffer): Promise<ArtifactRef>;
  read(ref: ArtifactRef): Promise<Buffer>;
  exists(ref: ArtifactRef): Promise<boolean>;
  delete(ref: ArtifactRef): Promise<void>;
}

export interface HandlerArgs<TInput, TCtx> {
  input: TInput;
  ctx: TCtx & { artifacts: Artifacts };
}

export interface UpdateArgs<TInput, TCtx> {
  input: TInput;
  old: unknown;
  ctx: TCtx & { artifacts: Artifacts };
}

export interface DiffArgs<TInput> {
  old: TInput;
  new: TInput;
  ctx: { artifacts: Artifacts };
}

export type DiffAction = "update" | "recreate" | "none";

export interface DiffResult {
  action: DiffAction;
  changes?: string[];
}

export interface CreateResult<TOutput = unknown> {
  externalId?: string;
  output: TOutput;
}

export interface Handlers<TInput, TCtx = unknown, TOutput = unknown> {
  create?(args: HandlerArgs<TInput, TCtx>): Promise<CreateResult<TOutput>>;
  read?(args: HandlerArgs<TInput, TCtx>): Promise<TOutput>;
  update?(args: UpdateArgs<TInput, TCtx>): Promise<TOutput>;
  delete?(args: HandlerArgs<TInput, TCtx>): Promise<void>;
  diff?(args: DiffArgs<TInput>): Promise<DiffResult>;
}

export interface ResourceDefinition<
  TInput = unknown,
  TOutput = unknown,
  TCtx = unknown,
> {
  [RESOURCE]: true;
  name: string;
  handlers: Handlers<TInput, TCtx, TOutput>;
}

/** User-facing resource reference. T is the output shape. */
export type Resource<T = unknown> = T & Dependable & Linkable;

/**
 * Internal factory — creates a constructor that registers entries in the global registry
 * and returns a Proxy-based Resource.
 *
 * The resource is branded with OUTPUT (path ""), DEPENDABLE, and LINKABLE.
 * For record outputs, property access returns Output for that key.
 * Unknown symbol access passes through to the target (supports secret() branding).
 */
export function createConstructor<C, TOutput = unknown>(
  providerName: string,
  providerInstance: Provider<unknown>,
  type: string,
  define: (id: string, config: C) => Record<string, unknown>,
): (id: string, config?: C, options?: ResourceOptions) => Resource<TOutput> {
  return (id: string, config?: C, options?: ResourceOptions) => {
    const scope = registry.currentScope();
    const resolvedId = scope ? `${scope.split(":").pop()}/${id}` : id;
    const resourceUrn = urn.build("resource", providerName, type, resolvedId);
    const resolvedConfig = config ?? ({} as C);
    const value = define(id, resolvedConfig);
    const entry: ResourceEntry = {
      [DEPENDABLE]: true,
      [LINKABLE]: true,
      urn: resourceUrn,
      value,
      config: resolvedConfig,
      provider: providerInstance,
    };
    if (options?.dependsOn) {
      entry.dependsOn = options.dependsOn;
    }
    if (scope) {
      const parentDep: Dependable = { [DEPENDABLE]: true, urn: scope };
      entry.dependsOn = entry.dependsOn
        ? [parentDep, ...entry.dependsOn]
        : [parentDep];
    }
    registry.register(entry);

    const target = Object.create(null) as Record<string | symbol, unknown>;
    Object.defineProperty(target, "urn", {
      value: resourceUrn,
      enumerable: false,
      configurable: false,
    });
    Object.defineProperty(target, OUTPUT, {
      value: true,
      enumerable: false,
      configurable: false,
    });
    Object.defineProperty(target, "path", {
      value: "",
      enumerable: false,
      configurable: false,
    });
    Object.defineProperty(target, "kind", {
      value: "output",
      enumerable: false,
      configurable: false,
    });
    Object.defineProperty(target, DEPENDABLE, {
      value: true,
      enumerable: false,
      configurable: false,
    });
    Object.defineProperty(target, LINKABLE, {
      value: true,
      enumerable: false,
      configurable: false,
    });

    const outputCache = new Map<string, Output>();
    return new Proxy(target, {
      get(t, prop) {
        if (prop === "urn") return resourceUrn;
        if (prop === "path") return "";
        if (prop === "kind") return "output";
        if (prop === OUTPUT) return true;
        if (prop === DEPENDABLE) return true;
        if (prop === LINKABLE) return true;
        // Pass through unknown symbols to target (supports secret() branding)
        if (typeof prop === "symbol") return t[prop];
        const key = prop;
        const cached = outputCache.get(key);
        if (cached) return cached;
        const output = createOutput(resourceUrn, key);
        outputCache.set(key, output);
        return output;
      },
      has(t, prop) {
        if (prop === "urn" || prop === "path" || prop === "kind") return true;
        if (prop === OUTPUT || prop === DEPENDABLE || prop === LINKABLE)
          return true;
        // Check target for unknown symbols (supports secret() branding check)
        if (typeof prop === "symbol") return prop in t;
        return true;
      },
    }) as Resource<TOutput>;
  };
}

/**
 * User-facing composition primitive — groups child resources under a named scope.
 */
export function resource<C, T>(
  type: string,
  define: (id: string, config: C) => T,
): (id: string, config?: C) => T {
  return (id: string, config?: C) => {
    const scopeUrn = urn.build("resource", "custom", type, id);
    registry.pushScope(scopeUrn);
    try {
      const resolvedConfig = config ?? ({} as C);
      return define(id, resolvedConfig);
    } finally {
      registry.popScope();
    }
  };
}
