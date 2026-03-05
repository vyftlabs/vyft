/**
 * Platform contract types.
 */

import type {
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
} from "@vyft/core";
import type { LifecycleHandlers } from "@vyft/provider";

// Re-export platform shapes from core
export type {
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
  SSHConnection,
} from "@vyft/core";

// Backward-compat aliases
export type BucketConfig = PlatformBucketConfig;
export type BucketState = PlatformBucketState;
export type PostgresConfig = PlatformPostgresConfig;
export type PostgresState = PlatformPostgresState;
export type QueueConfig = PlatformQueueConfig;
export type QueueState = PlatformQueueState;
export type SecretConfig = PlatformSecretConfig;
export type SecretState = PlatformSecretState;
export type ServerConfig = PlatformServerConfig;
export type ServerState = PlatformServerState;
export type VolumeConfig = PlatformVolumeConfig;
export type VolumeState = PlatformVolumeState;

// ============================================================================
// Platform Handler Types (using provider's LifecycleHandlers)
// ============================================================================

export type BucketHandler<TCtx> = LifecycleHandlers<
  PlatformBucketConfig,
  PlatformBucketState,
  TCtx
>;
export type PostgresHandler<TCtx> = LifecycleHandlers<
  PlatformPostgresConfig,
  PlatformPostgresState,
  TCtx
>;
export type QueueHandler<TCtx> = LifecycleHandlers<
  PlatformQueueConfig,
  PlatformQueueState,
  TCtx
>;
export type SecretHandler<TCtx> = LifecycleHandlers<
  PlatformSecretConfig,
  PlatformSecretState,
  TCtx
>;
export type VolumeHandler<TCtx> = LifecycleHandlers<
  PlatformVolumeConfig,
  PlatformVolumeState,
  TCtx
>;
export type ServerHandler<TCtx> = LifecycleHandlers<
  PlatformServerConfig,
  PlatformServerState,
  TCtx
>;

// ============================================================================
// Platform Contract
// ============================================================================

export interface Platform<TCtx = unknown> {
  readonly name: string;
  setup(): TCtx;
  teardown?(ctx: TCtx): Promise<void>;

  // Required - fundamental infrastructure
  server: ServerHandler<TCtx>;
  volume: VolumeHandler<TCtx>;

  // Optional - fall back to container-based defaults if not provided
  bucket?: BucketHandler<TCtx>;
  postgres?: PostgresHandler<TCtx>;
  queue?: QueueHandler<TCtx>;
  secret?: SecretHandler<TCtx>;
}
