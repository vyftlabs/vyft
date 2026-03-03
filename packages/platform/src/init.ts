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
  BucketConfig,
  BucketState,
  Platform,
  PostgresConfig,
  PostgresState,
  QueueConfig,
  QueueState,
  SecretConfig,
  SecretState,
  ServerConfig,
  ServerState,
  VolumeConfig,
  VolumeState,
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
    handler: LifecycleHandlers<BucketConfig, BucketState, TCtx>,
  ): BrandedHandler<TName, BucketConfig, BucketState, TCtx>;

  postgres(
    handler: LifecycleHandlers<PostgresConfig, PostgresState, TCtx>,
  ): BrandedHandler<TName, PostgresConfig, PostgresState, TCtx>;

  queue(
    handler: LifecycleHandlers<QueueConfig, QueueState, TCtx>,
  ): BrandedHandler<TName, QueueConfig, QueueState, TCtx>;

  secret(
    handler: LifecycleHandlers<SecretConfig, SecretState, TCtx>,
  ): BrandedHandler<TName, SecretConfig, SecretState, TCtx>;

  volume(
    handler: LifecycleHandlers<VolumeConfig, VolumeState, TCtx>,
  ): BrandedHandler<TName, VolumeConfig, VolumeState, TCtx>;

  server(
    handler: LifecycleHandlers<ServerConfig, ServerState, TCtx>,
  ): BrandedHandler<TName, ServerConfig, ServerState, TCtx>;

  define(handlers: {
    // Required - fundamental infrastructure
    server: BrandedHandler<TName, ServerConfig, ServerState, TCtx>;
    volume: BrandedHandler<TName, VolumeConfig, VolumeState, TCtx>;
    // Optional - fall back to container-based defaults if not provided
    bucket?: BrandedHandler<TName, BucketConfig, BucketState, TCtx>;
    postgres?: BrandedHandler<TName, PostgresConfig, PostgresState, TCtx>;
    queue?: BrandedHandler<TName, QueueConfig, QueueState, TCtx>;
    secret?: BrandedHandler<TName, SecretConfig, SecretState, TCtx>;
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
