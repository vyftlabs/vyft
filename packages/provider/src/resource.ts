import type { z } from "zod";

import type { ProviderContext } from "./context.ts";
import type { ResourceHandler, ResourceSchema } from "./types.ts";

/** The value returned by {@link defineResource}. */
// biome-ignore lint/suspicious/noExplicitAny: generic default for unconstrained type parameter
export type ResourceDefinition<C = any, O = any, Ctx = any> = {
  readonly kind: "resource:definition";
  readonly name: string | undefined;
  readonly schema: ResourceSchema;
  readonly handler: ResourceHandler<C, O, Ctx>;
};

// ── Standalone overload ─────────────────────────────────────────────────

type StandaloneOptions<C extends z.ZodType, O extends z.ZodType, Ctx> = {
  name: string;
  context: ProviderContext<string, string[], Ctx>;
  config: C;
  outputs: O;
};

// ── Contract overload ───────────────────────────────────────────────────

type ContractOptions<C extends z.ZodType, O extends z.ZodType, Ctx> = {
  context: ProviderContext<string, string[], Ctx>;
  schema: ResourceSchema<C, O>;
};

/**
 * Define a standalone resource with inline schema.
 *
 * @example
 * ```ts
 * const firewall = defineResource({
 *   name: "firewall",
 *   context,
 *   config: z.object({ rules: z.array(z.string()) }),
 *   outputs: z.object({ firewallId: z.number() }),
 * }, {
 *   async create(id, config, { client }) { ... },
 * });
 * ```
 */
export function defineResource<C extends z.ZodType, O extends z.ZodType, Ctx>(
  options: StandaloneOptions<C, O, Ctx>,
  handler: ResourceHandler<z.infer<C>, z.infer<O>, Ctx>,
): ResourceDefinition<z.infer<C>, z.infer<O>, Ctx>;

/**
 * Define a resource that implements a contract from a module shape.
 *
 * @example
 * ```ts
 * const network = defineResource({
 *   context,
 *   schema: Platform.network,
 * }, {
 *   async create(id, config, { client }) { ... },
 * });
 * ```
 */
export function defineResource<C extends z.ZodType, O extends z.ZodType, Ctx>(
  options: ContractOptions<C, O, Ctx>,
  handler: ResourceHandler<z.infer<C>, z.infer<O>, Ctx>,
): ResourceDefinition<z.infer<C>, z.infer<O>, Ctx>;

export function defineResource(
  options: {
    name?: string;
    context: ProviderContext;
    schema?: ResourceSchema;
    config?: z.ZodType;
    outputs?: z.ZodType;
  },
  handler: ResourceHandler,
): ResourceDefinition {
  if (!options.schema && (!options.config || !options.outputs)) {
    throw new Error(
      "defineResource requires either a schema or both config and outputs",
    );
  }

  const schema: ResourceSchema = options.schema ?? {
    config: options.config as z.ZodType,
    outputs: options.outputs as z.ZodType,
  };

  return {
    kind: "resource:definition",
    name: options.name,
    schema,
    handler,
  };
}
