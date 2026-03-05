/**
 * Platform initialization with branded type enforcement.
 *
 * @example
 * ```ts
 * // platforms/aws/mod.ts
 * export const t = initPlatform({
 *   name: "aws",
 *   setup: () => ({ s3: new S3Client(), rds: new RDSClient() }),
 * });
 *
 * // platforms/aws/bucket.ts
 * import { t } from "./mod.ts";
 * export const bucket = t.bucket({
 *   create: async ({ id, input, ctx }) => { ... },
 *   read: async ({ id, ctx }) => { ... },
 *   update: async ({ id, input, ctx }) => { ... },
 *   delete: async ({ id, ctx }) => { ... },
 * });
 *
 * // platforms/aws/index.ts
 * import { t } from "./mod.ts";
 * import { bucket } from "./bucket.ts";
 * import { postgres } from "./postgres.ts";
 * import { queue } from "./queue.ts";
 * import { secret } from "./secret.ts";
 * import { volume } from "./volume.ts";
 * import { server } from "./server.ts";
 * export default t.define({ bucket, postgres, queue, secret, volume, server });
 * ```
 */

import type { LifecycleHandlers } from "@vyft/provider";
import type {
  Platform,
  PlatformBucketConfig,
  PlatformBucketState,
  PlatformPostgresConfig,
  PlatformPostgresState,
  PlatformQueueConfig,
  PlatformQueueState,
  PlatformSecretConfig,
  PlatformSecretState,
  PlatformServerConfig,
  PlatformServerState,
  PlatformVolumeConfig,
  PlatformVolumeState,
} from "./contracts.ts";

// ============================================================================
// Branded Handler Types
// ============================================================================

/**
 * Branded handler type for platform-specific handlers.
 * The __brand property is never actually set at runtime - it's purely for type safety.
 */
export type BrandedHandler<
  TName extends string,
  TConfig,
  TState,
  TCtx,
> = LifecycleHandlers<TConfig, TState, TCtx> & { readonly __brand: TName };

// ============================================================================
// Platform Builder
// ============================================================================

export interface PlatformInit<TName extends string, TCtx> {
  name: TName;
  setup: () => TCtx;
  teardown?: (ctx: TCtx) => Promise<void>;
}

export interface PlatformBuilder<TName extends string, TCtx> {
  readonly name: TName;

  bucket(
    handler: LifecycleHandlers<PlatformBucketConfig, PlatformBucketState, TCtx>,
  ): BrandedHandler<TName, PlatformBucketConfig, PlatformBucketState, TCtx>;

  postgres(
    handler: LifecycleHandlers<
      PlatformPostgresConfig,
      PlatformPostgresState,
      TCtx
    >,
  ): BrandedHandler<TName, PlatformPostgresConfig, PlatformPostgresState, TCtx>;

  queue(
    handler: LifecycleHandlers<PlatformQueueConfig, PlatformQueueState, TCtx>,
  ): BrandedHandler<TName, PlatformQueueConfig, PlatformQueueState, TCtx>;

  secret(
    handler: LifecycleHandlers<PlatformSecretConfig, PlatformSecretState, TCtx>,
  ): BrandedHandler<TName, PlatformSecretConfig, PlatformSecretState, TCtx>;

  volume(
    handler: LifecycleHandlers<PlatformVolumeConfig, PlatformVolumeState, TCtx>,
  ): BrandedHandler<TName, PlatformVolumeConfig, PlatformVolumeState, TCtx>;

  server(
    handler: LifecycleHandlers<PlatformServerConfig, PlatformServerState, TCtx>,
  ): BrandedHandler<TName, PlatformServerConfig, PlatformServerState, TCtx>;

  define(handlers: {
    // Required - fundamental infrastructure
    server: BrandedHandler<
      TName,
      PlatformServerConfig,
      PlatformServerState,
      TCtx
    >;
    volume: BrandedHandler<
      TName,
      PlatformVolumeConfig,
      PlatformVolumeState,
      TCtx
    >;
    // Optional - fall back to container-based defaults if not provided
    bucket?: BrandedHandler<
      TName,
      PlatformBucketConfig,
      PlatformBucketState,
      TCtx
    >;
    postgres?: BrandedHandler<
      TName,
      PlatformPostgresConfig,
      PlatformPostgresState,
      TCtx
    >;
    queue?: BrandedHandler<
      TName,
      PlatformQueueConfig,
      PlatformQueueState,
      TCtx
    >;
    secret?: BrandedHandler<
      TName,
      PlatformSecretConfig,
      PlatformSecretState,
      TCtx
    >;
  }): Platform<TCtx>;
}

export function initPlatform<TName extends string, TCtx>(
  init: PlatformInit<TName, TCtx>,
): PlatformBuilder<TName, TCtx> {
  const { name, setup, teardown } = init;

  function brandHandler<TConfig, TState>(
    handler: LifecycleHandlers<TConfig, TState, TCtx>,
  ): BrandedHandler<TName, TConfig, TState, TCtx> {
    return handler as BrandedHandler<TName, TConfig, TState, TCtx>;
  }

  return {
    name,

    bucket(handler) {
      return brandHandler(handler);
    },

    postgres(handler) {
      return brandHandler(handler);
    },

    queue(handler) {
      return brandHandler(handler);
    },

    secret(handler) {
      return brandHandler(handler);
    },

    volume(handler) {
      return brandHandler(handler);
    },

    server(handler) {
      return brandHandler(handler);
    },

    define(handlers): Platform<TCtx> {
      return {
        name,
        setup,
        ...(teardown && { teardown }),
        // Required
        server: handlers.server,
        volume: handlers.volume,
        // Optional
        ...(handlers.bucket && { bucket: handlers.bucket }),
        ...(handlers.postgres && { postgres: handlers.postgres }),
        ...(handlers.queue && { queue: handlers.queue }),
        ...(handlers.secret && { secret: handlers.secret }),
      };
    },
  };
}
