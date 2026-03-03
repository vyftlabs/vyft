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
 * import { config } from "./config.ts";
 * import { cronjob } from "./cronjob.ts";
 * import { volume } from "./volume.ts";
 * export default t.define({ service, config, cronjob, volume });
 * ```
 */

import type {
  ConfigConfig,
  CronJobConfig,
  ServiceConfig,
  VolumeConfig,
} from "@vyft/core";
import type { LifecycleHandlers } from "@vyft/provider";
import type {
  ConfigState,
  CronJobState,
  Runtime,
  ServiceState,
  VolumeState,
} from "./contracts.ts";

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
    handler: LifecycleHandlers<ServiceConfig, ServiceState, TCtx>,
  ): BrandedHandler<TName, ServiceConfig, ServiceState, TCtx>;

  config(
    handler: LifecycleHandlers<ConfigConfig, ConfigState, TCtx>,
  ): BrandedHandler<TName, ConfigConfig, ConfigState, TCtx>;

  cronjob(
    handler: LifecycleHandlers<CronJobConfig, CronJobState, TCtx>,
  ): BrandedHandler<TName, CronJobConfig, CronJobState, TCtx>;

  volume(
    handler: LifecycleHandlers<VolumeConfig, VolumeState, TCtx>,
  ): BrandedHandler<TName, VolumeConfig, VolumeState, TCtx>;

  define(handlers: {
    service: BrandedHandler<TName, ServiceConfig, ServiceState, TCtx>;
    config: BrandedHandler<TName, ConfigConfig, ConfigState, TCtx>;
    cronjob: BrandedHandler<TName, CronJobConfig, CronJobState, TCtx>;
    volume: BrandedHandler<TName, VolumeConfig, VolumeState, TCtx>;
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

    config(handler) {
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
        config: handlers.config,
        cronjob: handlers.cronjob,
        volume: handlers.volume,
      };
    },
  };
}
