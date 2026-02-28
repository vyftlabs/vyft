import type { z } from "zod";

/**
 * Identifier passed to every lifecycle method.
 *
 * `internal` is the stable ID assigned by vyft. `externalId` is the
 * provider-assigned identifier (e.g. a Hetzner network ID) and is
 * populated after the first successful `create`.
 */
export interface ResourceId {
  readonly internal: string;
  readonly externalId?: string;
}

/** Value returned from `create`, `read`, and `update` lifecycle methods. */
export interface HandlerResult<O> {
  externalId?: string;
  outputs: O;
}

/**
 * Lifecycle handler for a single resource kind.
 *
 * Only `create` is required — `read`, `update`, and `delete` are optional
 * and default to no-ops when omitted.
 */
// biome-ignore lint/suspicious/noExplicitAny: generic default for unconstrained type parameter
export interface ResourceHandler<C = any, O = any, Ctx = any> {
  create(id: ResourceId, config: C, ctx: Ctx): Promise<HandlerResult<O>>;
  read?(id: ResourceId, ctx: Ctx): Promise<HandlerResult<O> | null>;
  update?(id: ResourceId, config: C, ctx: Ctx): Promise<HandlerResult<O>>;
  delete?(id: ResourceId, ctx: Ctx): Promise<void>;
}

/** Schema declaration for a single resource kind inside a module shape. */
export interface ResourceSchema<
  C extends z.ZodType = z.ZodType,
  O extends z.ZodType = z.ZodType,
> {
  /** Zod schema for the resource configuration. */
  config: C;
  /** Zod schema for the resource outputs. */
  outputs: O;
}

/** A record of resource names to their schemas — the shape of a module. */
export type ModuleShape = Record<string, ResourceSchema>;

/** Symbol used to store the module namespace on a shape. */
export const MODULE_NAMESPACE: unique symbol = Symbol.for(
  "vyft:module:namespace",
);

/** A module shape with a namespace attached. */
export type NamedModuleShape<
  N extends string = string,
  T extends ModuleShape = ModuleShape,
> = T & { readonly [MODULE_NAMESPACE]: N };
