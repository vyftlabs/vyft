import {
  DEPENDABLE,
  type Dependable,
  LINKABLE,
  type Linkable,
  MOUNTABLE,
  type Mountable,
} from "@vyft/engine";
import type { Output } from "./output.ts";
import { createOutput, OUTPUT, TYPE } from "./output.ts";
import type { Provider } from "./provider.ts";
import { registry } from "./registry.ts";
import type { URN } from "./urn.ts";
import { urn } from "./urn.ts";

export const RESOURCE: unique symbol = Symbol("vyft.resource");

export interface ResourceRef<T = unknown> {
  urn: URN;
  readonly [TYPE]?: T;
}

export interface ResourceOptions {
  dependsOn?: Dependable[];
}

export interface ResourceEntry<T = unknown> extends ResourceRef<T> {
  [DEPENDABLE]: true;
  value: Record<string, unknown>;
  /** Original config before transformation — preserved for tooling (e.g. local dev runner) */
  config?: unknown;
  dependsOn?: string[];
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

/** Eagerly expands named types so hover tooltips show structural form. */
type Expand<T> = T extends object
  ? T extends readonly unknown[]
    ? T
    : { [K in keyof T]: T[K] }
  : T;

/** Maps a handler output type to what the user sees on the resource handle. */
type OutputShape<T> = T extends object
  ? T extends readonly unknown[]
    ? Output<T>
    : { [K in keyof T]: Output<T[K]> }
  : Output<T>;

/** User-facing resource reference. T is the raw output shape from handlers. */
export type Resource<T = unknown> = OutputShape<T> & Dependable;

/** Resource that can be passed to `link` — only services produce host/port/url. */
export type LinkableResource<T = unknown> = Resource<T> & Linkable;

/** Resource that can be passed as a mount source — only volumes. */
export type MountableResource<T = unknown> = Resource<T> & Mountable;

/**
 * Internal factory — creates a constructor that registers entries in the global registry
 * and returns a Proxy-based Resource.
 *
 * The resource is branded with OUTPUT (path ""), DEPENDABLE, and optionally LINKABLE.
 * For record outputs, property access returns Output for that key.
 * Unknown symbol access passes through to the target (supports secret() branding).
 */
export function createConstructor<C, TOutput = unknown>(
  providerName: string,
  providerInstance: Provider<unknown>,
  type: string,
  define: (id: string, config: C) => Record<string, unknown>,
  options: { linkable: true },
): (
  id: string,
  config?: C,
  options?: ResourceOptions,
) => LinkableResource<Expand<TOutput>>;
export function createConstructor<C, TOutput = unknown>(
  providerName: string,
  providerInstance: Provider<unknown>,
  type: string,
  define: (id: string, config: C) => Record<string, unknown>,
  options: { mountable: true },
): (
  id: string,
  config?: C,
  options?: ResourceOptions,
) => MountableResource<Expand<TOutput>>;
export function createConstructor<C, TOutput = unknown>(
  providerName: string,
  providerInstance: Provider<unknown>,
  type: string,
  define: (id: string, config: C) => Record<string, unknown>,
  options?: { linkable?: boolean; mountable?: boolean },
): (
  id: string,
  config?: C,
  options?: ResourceOptions,
) => Resource<Expand<TOutput>>;
export function createConstructor<C, TOutput = unknown>(
  providerName: string,
  providerInstance: Provider<unknown>,
  type: string,
  define: (id: string, config: C) => Record<string, unknown>,
  constructorOptions?: { linkable?: boolean; mountable?: boolean },
): (
  id: string,
  config?: C,
  options?: ResourceOptions,
) => Resource<Expand<TOutput>> {
  return (id: string, config?: C, options?: ResourceOptions) => {
    const scope = registry.currentScope();
    const resolvedId = scope ? `${scope.split(":").pop()}/${id}` : id;
    const resourceUrn = urn.build("resource", providerName, type, resolvedId);
    const resolvedConfig = config ?? ({} as C);
    const value = define(id, resolvedConfig);
    const entry: ResourceEntry = {
      [DEPENDABLE]: true,
      urn: resourceUrn,
      value,
      config: resolvedConfig,
      provider: providerInstance,
    };
    if (options?.dependsOn) {
      entry.dependsOn = options.dependsOn.map((dep) => registry.urnOf(dep));
    }
    if (scope) {
      entry.dependsOn = entry.dependsOn ? [scope, ...entry.dependsOn] : [scope];
    }
    registry.register(entry);

    const target = Object.create(null) as Record<string | symbol, unknown>;
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
    const isLinkable = constructorOptions?.linkable === true;
    if (isLinkable) {
      Object.defineProperty(target, LINKABLE, {
        value: true,
        enumerable: false,
        configurable: false,
      });
    }
    const isMountable = constructorOptions?.mountable === true;
    if (isMountable) {
      Object.defineProperty(target, MOUNTABLE, {
        value: true,
        enumerable: false,
        configurable: false,
      });
    }

    const outputCache = new Map<string, Output>();
    const proxy = new Proxy(target, {
      get(t, prop) {
        if (prop === "path") return "";
        if (prop === "kind") return "output";
        if (prop === OUTPUT) return true;
        if (prop === DEPENDABLE) return true;
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
        if (prop === "path" || prop === "kind") return true;
        if (prop === OUTPUT || prop === DEPENDABLE) return true;
        if (prop === LINKABLE) return isLinkable;
        if (prop === MOUNTABLE) return isMountable;
        // Check target for unknown symbols (supports secret() branding check)
        if (typeof prop === "symbol") return prop in t;
        return true;
      },
    }) as Resource<Expand<TOutput>>;
    registry.registerHandle(proxy, resourceUrn);
    return proxy;
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
