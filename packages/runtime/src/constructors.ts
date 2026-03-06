import {
  type Provider,
  type ResourceEntry,
  type ResourceOptions,
  resource,
} from "@vyft/core";
import type { CronJobInput, ServiceInput, VolumeInput } from "./schemas.ts";

export const RUNTIME_PROVIDER_NAME = "runtime";

const lazyProvider: Provider<unknown> = {
  config: {
    context() {
      throw new Error(
        "Runtime provider must be resolved before use. This is a bug — the CLI should swap the sentinel provider at deploy time.",
      );
    },
    resources: {},
  },
};

export interface ServiceConfig {
  image?: string;
  path?: string;
  cwd?: string;
  port?: number;
  route?: string;
  env?: Record<string, string>;
  command?: string[];
  mounts?: Array<{ source: string; target: string }>;
  health?: {
    path: string;
    interval?: string;
    timeout?: string;
    retries?: number;
  };
  restart?: "always" | "on-failure" | "unless-stopped" | "no";
  expose?: boolean;
}

export interface VolumeConfig {
  size?: string;
}

export interface CronJobConfig {
  schedule: string;
  image?: string;
  path?: string;
  cwd?: string;
  command?: string[];
  env?: Record<string, string>;
  mounts?: Array<{ source: string; target: string }>;
  health?: {
    path: string;
    interval?: string;
    timeout?: string;
    retries?: number;
  };
  restart?: "always" | "on-failure" | "unless-stopped" | "no";
}

export const service: {
  (
    id: string,
    config: ServiceConfig,
    options?: ResourceOptions,
  ): ResourceEntry<ServiceInput>;
  (id: string): { urn: string };
} = resource<ServiceConfig, ServiceInput>(
  RUNTIME_PROVIDER_NAME,
  lazyProvider,
  "service",
  (_id, config) => {
    const env: Record<string, string> = {
      PORT: String(config.port ?? 3000),
      NODE_ENV: "production",
      ...config.env,
    };

    return {
      image: config.image,
      path: config.path ?? (config.image ? undefined : "."),
      cwd: config.cwd,
      port: config.port ?? 3000,
      route: config.route,
      env,
      command: config.command,
      mounts: config.mounts,
      health: config.health,
      restart: config.restart ?? "always",
      expose: config.expose,
    };
  },
);

export const volume: {
  (
    id: string,
    config: VolumeConfig,
    options?: ResourceOptions,
  ): ResourceEntry<VolumeInput>;
  (id: string): { urn: string };
} = resource<VolumeConfig, VolumeInput>(
  RUNTIME_PROVIDER_NAME,
  lazyProvider,
  "volume",
  (_id, config) => ({
    size: config.size,
  }),
);

export const cronjob: {
  (
    id: string,
    config: CronJobConfig,
    options?: ResourceOptions,
  ): ResourceEntry<CronJobInput>;
  (id: string): { urn: string };
} = resource<CronJobConfig, CronJobInput>(
  RUNTIME_PROVIDER_NAME,
  lazyProvider,
  "cronjob",
  (_id, config) => ({
    schedule: config.schedule,
    image: config.image,
    path: config.path,
    cwd: config.cwd,
    command: config.command,
    env: config.env,
    mounts: config.mounts,
    health: config.health,
    restart: config.restart ?? "on-failure",
  }),
);
