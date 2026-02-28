import type { z } from "zod";
import type { ResourceDefinition } from "./resource.ts";
import {
  MODULE_NAMESPACE,
  type ModuleShape,
  type NamedModuleShape,
} from "./types.ts";

// ── defineModuleShape ────────────────────────────────────────────────────

/**
 * Declare a module shape — a record of resource names to their zod schemas.
 * The namespace is used to derive URNs (e.g. `vyft:{namespace}:{key}`).
 *
 * @example
 * ```ts
 * const Platform = defineModuleShape("platform", {
 *   network: {
 *     config: z.object({ location: z.string() }),
 *     outputs: z.object({ publicIp: z.string() }),
 *   },
 * });
 * ```
 */
export function defineModuleShape<N extends string, T extends ModuleShape>(
  namespace: N,
  shape: T,
): NamedModuleShape<N, T> {
  return Object.assign(shape, {
    [MODULE_NAMESPACE]: namespace,
  }) as NamedModuleShape<N, T>;
}

// ── defineModule ─────────────────────────────────────────────────────────

/** Map a module shape to the expected resource definitions. */
type ResourcesFor<T extends ModuleShape> = {
  [K in keyof T & string]: ResourceDefinition<
    z.infer<T[K]["config"]>,
    z.infer<T[K]["outputs"]>,
    // biome-ignore lint/suspicious/noExplicitAny: context type is not constrained by module shape
    any
  >;
};

/** The value returned by {@link defineModule}. */
export type Module<T extends ModuleShape = ModuleShape> = {
  readonly kind: "module";
  readonly namespace: string;
  readonly shape: T;
  readonly resources: ResourcesFor<T>;
};

/**
 * Assemble a module from a shape contract and resource definitions.
 * All resource keys declared in the shape must be provided.
 *
 * @example
 * ```ts
 * const platform = defineModule(Platform, { network, server });
 * ```
 */
export function defineModule<T extends ModuleShape>(
  shape: T,
  resources: ResourcesFor<T>,
): Module<T> {
  // biome-ignore lint/suspicious/noExplicitAny: accessing internal symbol property
  const namespace = (shape as any)[MODULE_NAMESPACE] ?? "";
  return { kind: "module", namespace, shape, resources };
}
