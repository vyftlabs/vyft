/**
 * Platform contract types.
 */

import type { LifecycleHandlers } from "@vyft/provider";

// ============================================================================
// Platform Config Types
// ============================================================================

export interface BucketConfig {
  /** Access control: private or public-read */
  acl?: "private" | "public-read";
}

export interface BucketState {
  url: string;
  name: string;
}

export interface PostgresConfig {
  /** Postgres version (e.g., "16", "15") */
  version?: string;
}

export interface PostgresState {
  /** Connection URL */
  url: string;
  /** Database host */
  host: string;
  /** Database port */
  port: number;
}

export interface QueueConfig {
  durable?: boolean;
}

export interface QueueState {
  url: string;
  name: string;
}

export interface SecretConfig {
  /** Length for generated secrets */
  length?: number;
  /** Character set for generated secrets */
  alphabet?: string;
}

export interface SecretState {
  /** The secret value (only available at runtime, not stored in state) */
  value: string;
}

export interface VolumeConfig {
  /** Size of the volume (e.g., "10Gi") */
  size?: string;
}

export interface VolumeState {
  /** Volume identifier for mounting */
  name: string;
}

export interface ServerConfig {
  /** Server type/size (e.g., "cx11", "t3.micro") */
  type: string;
  /** OS image */
  image: string;
  /** SSH keys */
  sshKeys?: string[];
  /** User data / cloud-init */
  userData?: string;
}

export interface ServerState {
  /** Public IP address */
  ip: string;
  /** Server ID */
  id: string;
}

// ============================================================================
// Platform Handler Types (using provider's LifecycleHandlers)
// ============================================================================

export type BucketHandler<TCtx> = LifecycleHandlers<
  BucketConfig,
  BucketState,
  TCtx
>;
export type PostgresHandler<TCtx> = LifecycleHandlers<
  PostgresConfig,
  PostgresState,
  TCtx
>;
export type QueueHandler<TCtx> = LifecycleHandlers<
  QueueConfig,
  QueueState,
  TCtx
>;
export type SecretHandler<TCtx> = LifecycleHandlers<
  SecretConfig,
  SecretState,
  TCtx
>;
export type VolumeHandler<TCtx> = LifecycleHandlers<
  VolumeConfig,
  VolumeState,
  TCtx
>;
export type ServerHandler<TCtx> = LifecycleHandlers<
  ServerConfig,
  ServerState,
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
