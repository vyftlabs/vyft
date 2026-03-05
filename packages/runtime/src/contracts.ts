/**
 * Runtime contract types.
 */

import type {
  CronJobConfig,
  ServiceConfig,
  VariableConfig,
  VolumeConfig,
} from "@vyft/primitives";
import type { LifecycleHandlers } from "./lifecycle.ts";

export interface RuntimeServiceState {
  host: string;
  port: number;
  url: string;
}

export interface RuntimeVariableState {
  value: string;
}

export interface RuntimeCronJobState {
  name: string;
}

export interface RuntimeVolumeState {
  name: string;
}

// Backward-compat aliases
export type ServiceState = RuntimeServiceState;
export type ConfigState = RuntimeVariableState;
export type CronJobState = RuntimeCronJobState;
export type VolumeState = RuntimeVolumeState;

// ============================================================================
// Runtime Handler Types (using provider's LifecycleHandlers)
// ============================================================================

export type ServiceHandler<TCtx> = LifecycleHandlers<
  ServiceConfig,
  RuntimeServiceState,
  TCtx
>;
export type VariableHandler<TCtx> = LifecycleHandlers<
  VariableConfig,
  RuntimeVariableState,
  TCtx
>;
/** @deprecated Use VariableHandler instead. */
export type ConfigHandler<TCtx> = VariableHandler<TCtx>;
export type CronJobHandler<TCtx> = LifecycleHandlers<
  CronJobConfig,
  RuntimeCronJobState,
  TCtx
>;
export type VolumeHandler<TCtx> = LifecycleHandlers<
  VolumeConfig,
  RuntimeVolumeState,
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
  variable: VariableHandler<TCtx>;
  cronjob: CronJobHandler<TCtx>;
  volume: VolumeHandler<TCtx>;
}
