/**
 * Runtime initialization with branded type enforcement.
 *
 * @example
 * ```ts
 * // runtimes/docker/mod.ts
 * export const t = initRuntime({
 *   name: "docker",
 *   setup: () => ({ client: createDockerClient() }),
 * });
 *
 * // runtimes/docker/service.ts
 * import { t } from "./mod.ts";
 * export const service = t.service({
 *   create: async ({ id, input, ctx }) => { ... },
 *   read: async ({ id, ctx }) => { ... },
 *   update: async ({ id, input, ctx }) => { ... },
 *   delete: async ({ id, ctx }) => { ... },
 * });
 *
 * // runtimes/docker/index.ts
 * import { t } from "./mod.ts";
 * import { service } from "./service.ts";
 * import { variable } from "./variable.ts";
 * import { cronjob } from "./cronjob.ts";
 * import { volume } from "./volume.ts";
 * export default t.define({ service, variable, cronjob, volume });
 * ```
 */

import type {
  CronJobConfig,
  ServiceConfig,
  VariableConfig,
  VolumeConfig,
} from "@vyft/primitives";
import type {
  Runtime,
  RuntimeCronJobState,
  RuntimeServiceState,
  RuntimeVariableState,
  RuntimeVolumeState,
} from "./contracts.ts";
import type { LifecycleHandlers } from "./lifecycle.ts";

// ============================================================================
// Branded Handler Types
// ============================================================================

/**
 * Branded handler type for runtime-specific handlers.
 * The __brand property is never actually set at runtime - it's purely for type safety.
 */
export type BrandedHandler<
  TName extends string,
  TConfig,
  TState,
  TCtx,
> = LifecycleHandlers<TConfig, TState, TCtx> & { readonly __brand: TName };

// ============================================================================
// Runtime Builder
// ============================================================================

export interface RuntimeInit<TName extends string, TCtx> {
  name: TName;
  setup: () => TCtx;
  teardown?: (ctx: TCtx) => Promise<void>;
}

export interface RuntimeBuilder<TName extends string, TCtx> {
  readonly name: TName;

  service(
    handler: LifecycleHandlers<ServiceConfig, RuntimeServiceState, TCtx>,
  ): BrandedHandler<TName, ServiceConfig, RuntimeServiceState, TCtx>;

  variable(
    handler: LifecycleHandlers<VariableConfig, RuntimeVariableState, TCtx>,
  ): BrandedHandler<TName, VariableConfig, RuntimeVariableState, TCtx>;

  cronjob(
    handler: LifecycleHandlers<CronJobConfig, RuntimeCronJobState, TCtx>,
  ): BrandedHandler<TName, CronJobConfig, RuntimeCronJobState, TCtx>;

  volume(
    handler: LifecycleHandlers<VolumeConfig, RuntimeVolumeState, TCtx>,
  ): BrandedHandler<TName, VolumeConfig, RuntimeVolumeState, TCtx>;

  define(handlers: {
    service: BrandedHandler<TName, ServiceConfig, RuntimeServiceState, TCtx>;
    variable: BrandedHandler<TName, VariableConfig, RuntimeVariableState, TCtx>;
    cronjob: BrandedHandler<TName, CronJobConfig, RuntimeCronJobState, TCtx>;
    volume: BrandedHandler<TName, VolumeConfig, RuntimeVolumeState, TCtx>;
  }): Runtime<TCtx>;
}

export function initRuntime<TName extends string, TCtx>(
  init: RuntimeInit<TName, TCtx>,
): RuntimeBuilder<TName, TCtx> {
  const { name, setup, teardown } = init;

  function brandHandler<TConfig, TState>(
    handler: LifecycleHandlers<TConfig, TState, TCtx>,
  ): BrandedHandler<TName, TConfig, TState, TCtx> {
    return handler as BrandedHandler<TName, TConfig, TState, TCtx>;
  }

  return {
    name,

    service(handler) {
      return brandHandler(handler);
    },

    variable(handler) {
      return brandHandler(handler);
    },

    cronjob(handler) {
      return brandHandler(handler);
    },

    volume(handler) {
      return brandHandler(handler);
    },

    define(handlers): Runtime<TCtx> {
      return {
        name,
        setup,
        ...(teardown && { teardown }),
        service: handlers.service,
        variable: handlers.variable,
        cronjob: handlers.cronjob,
        volume: handlers.volume,
      };
    },
  };
}
