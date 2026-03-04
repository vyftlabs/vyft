import type { OutputRef, ProviderResource } from "@vyft/core";
import { currentCollector, INTERNAL } from "@vyft/core";
import type { z } from "zod";

import type { ArtifactStore } from "./artifact.ts";

// ── Framework Context ────────────────────────────────────────────────────

/**
 * Context provided by the framework to all resource handlers.
 * Always available, not provider-configured.
 */
export interface FrameworkContext {
  /** Artifact store scoped to this resource */
  readonly artifacts: ArtifactStore;
  /** Resource metadata */
  readonly meta: {
    readonly resourceId: string;
    readonly resourceName: string;
  };
}

// ── Types ────────────────────────────────────────────────────────────────

export interface ResourceId {
  readonly internal: string;
  readonly externalId?: string;
}

export interface HandlerResult<O> {
  externalId?: string;
  output: O;
}

type MaybePromise<T> = T | Promise<T>;

/**
 * Lifecycle handlers for a resource.
 */
export interface LifecycleHandlers<I, O, Ctx> {
  create(args: {
    id: ResourceId;
    input: I;
    ctx: Ctx;
  }): MaybePromise<HandlerResult<O> | O>;

  read?(args: {
    id: ResourceId;
    ctx: Ctx;
  }): MaybePromise<HandlerResult<O> | O | null>;

  update?(args: {
    id: ResourceId;
    input: I;
    ctx: Ctx;
  }): MaybePromise<HandlerResult<O> | O>;

  delete?(args: { id: ResourceId; ctx: Ctx }): MaybePromise<void>;

  diff?(args: {
    id: ResourceId;
    input: I;
    previousOutput: O;
  }): MaybePromise<"create" | "update" | "recreate">;
}

/**
 * Middleware function that can transform context.
 */
export type Middleware<
  CtxIn,
  CtxOut,
  Secrets extends Record<string, string>,
> = (args: {
  ctx: CtxIn & FrameworkContext;
  secrets: Secrets;
  meta: FrameworkContext["meta"];
  next: <NewCtx>(args: { ctx: NewCtx }) => NewCtx & CtxIn & FrameworkContext;
}) => CtxOut & CtxIn & FrameworkContext;

// ── Resource Definition ──────────────────────────────────────────────────

export interface ResourceDefinition<I = unknown, O = unknown, Ctx = unknown> {
  readonly kind: "resource:definition";
  readonly provider: string;
  readonly name: string;
  readonly inputSchema: z.ZodType<I>;
  readonly handler: LifecycleHandlers<I, O, Ctx>;
  readonly middlewares: Middleware<unknown, unknown, Record<string, string>>[];
}

/**
 * A callable resource that creates instances when invoked.
 * Returns output properties. Definition is available at runtime under [INTERNAL].
 */
export type ResourceInstance<I, O, _Ctx> = (input: I) => O;

// ── Builder Interfaces ──────────────────────────────────────────────────

export interface ResourceBuilderWithInput<
  I,
  Ctx,
  Secrets extends Record<string, string>,
> {
  use<NewCtx>(
    middleware: Middleware<Ctx, NewCtx, Secrets>,
  ): ResourceBuilderWithInput<I, Ctx & NewCtx, Secrets>;

  handle<O>(
    handlers: LifecycleHandlers<I, O, Ctx & FrameworkContext>,
  ): ResourceInstance<I, O, Ctx & FrameworkContext>;
}

export interface NamedResourceBuilder<
  Ctx,
  Secrets extends Record<string, string>,
> {
  use<NewCtx>(
    middleware: Middleware<Ctx, NewCtx, Secrets>,
  ): NamedResourceBuilder<Ctx & NewCtx, Secrets>;

  input<I extends z.ZodType>(
    schema: I,
  ): ResourceBuilderWithInput<z.infer<I>, Ctx, Secrets>;
}

export interface ResourceBuilder<Ctx, Secrets extends Record<string, string>> {
  use<NewCtx>(
    middleware: Middleware<Ctx, NewCtx, Secrets>,
  ): ResourceBuilder<Ctx & NewCtx, Secrets>;

  input<I extends z.ZodType>(
    schema: I,
  ): ResourceBuilderWithInput<z.infer<I>, Ctx, Secrets>;
}

// ── Implementation ───────────────────────────────────────────────────────

/** Counter for generating unique resource IDs within a provider */
const idCounters = new Map<string, number>();

function nextId(provider: string, resourceType: string): string {
  const key = `${provider}:${resourceType}`;
  const count = (idCounters.get(key) ?? 0) + 1;
  idCounters.set(key, count);
  return `${provider}-${resourceType}-${count}`;
}

export function createResourceBuilderWithInput<
  I,
  Ctx,
  Secrets extends Record<string, string>,
>(
  provider: string,
  name: string,
  inputSchema: z.ZodType<I>,
  middlewares: Middleware<unknown, unknown, Record<string, string>>[],
): ResourceBuilderWithInput<I, Ctx, Secrets> {
  return {
    use<NewCtx>(middleware: Middleware<Ctx, NewCtx, Secrets>) {
      return createResourceBuilderWithInput<I, Ctx & NewCtx, Secrets>(
        provider,
        name,
        inputSchema,
        [
          ...middlewares,
          middleware as Middleware<unknown, unknown, Record<string, string>>,
        ],
      );
    },

    handle<O>(
      handlers:
        | LifecycleHandlers<I, O, Ctx & FrameworkContext>
        | ((args: {
            id: ResourceId;
            input: I;
            ctx: Ctx & FrameworkContext;
          }) => MaybePromise<HandlerResult<O> | O>),
    ): ResourceInstance<I, O, Ctx & FrameworkContext> {
      const normalizedHandlers: LifecycleHandlers<
        I,
        O,
        Ctx & FrameworkContext
      > = typeof handlers === "function" ? { create: handlers } : handlers;

      const definition: ResourceDefinition<I, O, Ctx & FrameworkContext> = {
        kind: "resource:definition",
        provider,
        name,
        inputSchema,
        handler: normalizedHandlers,
        middlewares,
      };

      // Create the callable function
      type Result = O & {
        readonly [INTERNAL]: ResourceDefinition<I, O, Ctx & FrameworkContext>;
      };
      const callable = (input: I): Result => {
        const id = nextId(provider, name);

        // Create output proxy - property access creates OutputRef references
        // that get resolved at deploy time
        const outputCache = new Map<string, OutputRef>();

        // Return a proxy: output properties at top level, definition under [INTERNAL]
        const result = new Proxy({} as Result, {
          get(_target, prop) {
            // Definition under [INTERNAL] symbol
            if (prop === INTERNAL) {
              return definition;
            }

            // Ignore other symbols
            if (typeof prop === "symbol") return undefined;

            // Output properties - create OutputRef on demand
            let ref = outputCache.get(prop);
            if (!ref) {
              ref = {
                kind: "provider-output",
                resourceId: id,
                property: prop,
              };
              outputCache.set(prop, ref);
            }
            return ref;
          },
        });

        // Create the provider resource and push to collector
        const resource: ProviderResource<O> = {
          kind: "provider",
          id,
          provider,
          type: name,
          input,
          output: result as unknown as O,
        };

        currentCollector()?.push(resource);

        return result;
      };

      return callable;
    },
  };
}

export function createNamedResourceBuilder<
  Ctx,
  Secrets extends Record<string, string>,
>(
  provider: string,
  name: string,
  middlewares: Middleware<unknown, unknown, Record<string, string>>[],
): NamedResourceBuilder<Ctx, Secrets> {
  return {
    use<NewCtx>(middleware: Middleware<Ctx, NewCtx, Secrets>) {
      return createNamedResourceBuilder<Ctx & NewCtx, Secrets>(provider, name, [
        ...middlewares,
        middleware as Middleware<unknown, unknown, Record<string, string>>,
      ]);
    },

    input<I extends z.ZodType>(schema: I) {
      return createResourceBuilderWithInput<z.infer<I>, Ctx, Secrets>(
        provider,
        name,
        schema as z.ZodType<z.infer<I>>,
        middlewares,
      );
    },
  };
}

export function createReusableResourceBuilder<
  Ctx,
  Secrets extends Record<string, string>,
>(
  provider: string,
  middlewares: Middleware<unknown, unknown, Record<string, string>>[],
): ResourceBuilder<Ctx, Secrets> {
  return {
    use<NewCtx>(middleware: Middleware<Ctx, NewCtx, Secrets>) {
      return createReusableResourceBuilder<Ctx & NewCtx, Secrets>(provider, [
        ...middlewares,
        middleware as Middleware<unknown, unknown, Record<string, string>>,
      ]);
    },

    input<I extends z.ZodType>(schema: I) {
      // This returns a builder that still needs a name
      // For now, use empty string - will be set when used
      return createResourceBuilderWithInput<z.infer<I>, Ctx, Secrets>(
        provider,
        "",
        schema as z.ZodType<z.infer<I>>,
        middlewares,
      );
    },
  };
}
