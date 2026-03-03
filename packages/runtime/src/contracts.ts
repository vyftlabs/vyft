/**
 * Runtime contract types.
 */

import type {
  ConfigConfig,
  CronJobConfig,
  ServiceConfig,
  VolumeConfig,
} from "@vyft/core";
import type { LifecycleHandlers } from "@vyft/provider";

// ============================================================================
// Runtime State Types
// ============================================================================

export interface ServiceState {
  host: string;
  port: number;
  url: string;
}

export interface ConfigState {
  value: string;
}

export interface CronJobState {
  name: string;
}

export interface VolumeState {
  /** Volume name for mounting */
  name: string;
}

// ============================================================================
// Runtime Handler Types (using provider's LifecycleHandlers)
// ============================================================================

export type ServiceHandler<TCtx> = LifecycleHandlers<
  ServiceConfig,
  ServiceState,
  TCtx
>;
export type ConfigHandler<TCtx> = LifecycleHandlers<
  ConfigConfig,
  ConfigState,
  TCtx
>;
export type CronJobHandler<TCtx> = LifecycleHandlers<
  CronJobConfig,
  CronJobState,
  TCtx
>;
export type VolumeHandler<TCtx> = LifecycleHandlers<
  VolumeConfig,
  VolumeState,
  TCtx
>;

// ============================================================================
// Runtime Contract
// ============================================================================

export interface Runtime<TCtx = unknown> {
  readonly name: string;
  setup(): TCtx;
  teardown?(ctx: TCtx): Promise<void>;

  service: ServiceHandler<TCtx>;
  config: ConfigHandler<TCtx>;
  cronjob: CronJobHandler<TCtx>;
  volume: VolumeHandler<TCtx>;
}
