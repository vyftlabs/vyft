import {
  type Handlers,
  type PlatformSchemas,
  platformSchemas,
  type ResourceDefinition,
} from "@vyft/core";
import { z } from "zod";

interface ResourceBuilder<TInput, TCtx> {
  handle(handlers: Handlers<TInput, TCtx>): ResourceDefinition<TInput, TCtx>;
}

interface ResourceEntrypoint<TCtx> {
  input<S extends z.ZodType>(schema: S): ResourceBuilder<z.infer<S>, TCtx>;
}

interface PlatformResourceBuilder<TBase, TCtx> {
  input<S extends z.ZodType>(
    schema: S,
  ): ResourceBuilder<TBase & { provider: z.infer<S> }, TCtx>;
  handle(handlers: Handlers<TBase, TCtx>): ResourceDefinition<TBase, TCtx>;
}

type PlatformEntrypoint<TCtx> = {
  [K in keyof PlatformSchemas]: PlatformResourceBuilder<
    z.infer<PlatformSchemas[K]>,
    TCtx
  >;
};

export interface ProviderBuilder<TCtx> {
  resource: ResourceEntrypoint<TCtx>;
  platform: PlatformEntrypoint<TCtx>;
}

function createResourceBuilder<TInput, TCtx>(
  schema: z.ZodType<TInput>,
): ResourceBuilder<TInput, TCtx> {
  return {
    handle(handlers) {
      return { schema, handlers };
    },
  };
}

function createResourceEntrypoint<TCtx>(): ResourceEntrypoint<TCtx> {
  return {
    input<S extends z.ZodType>(schema: S) {
      return createResourceBuilder<z.infer<S>, TCtx>(
        schema as z.ZodType<z.infer<S>>,
      );
    },
  };
}

function createPlatformResourceBuilder<TBase, TCtx>(
  baseSchema: z.ZodType<TBase>,
): PlatformResourceBuilder<TBase, TCtx> {
  return {
    input<S extends z.ZodType>(extendSchema: S) {
      const combined = z.intersection(
        baseSchema,
        z.object({ provider: extendSchema }),
      ) as unknown as z.ZodType<TBase & { provider: z.infer<S> }>;
      return createResourceBuilder<TBase & { provider: z.infer<S> }, TCtx>(
        combined,
      );
    },
    handle(handlers) {
      return { schema: baseSchema, handlers };
    },
  };
}

function createPlatformEntrypoint<TCtx>(): PlatformEntrypoint<TCtx> {
  return {
    server: createPlatformResourceBuilder<
      z.infer<typeof platformSchemas.server>,
      TCtx
    >(platformSchemas.server),
    volume: createPlatformResourceBuilder<
      z.infer<typeof platformSchemas.volume>,
      TCtx
    >(platformSchemas.volume),
    network: createPlatformResourceBuilder<
      z.infer<typeof platformSchemas.network>,
      TCtx
    >(platformSchemas.network),
  };
}

export function initProvider<
  TCtx = Record<string, never>,
>(): ProviderBuilder<TCtx> {
  return {
    resource: createResourceEntrypoint<TCtx>(),
    platform: createPlatformEntrypoint<TCtx>(),
  };
}
