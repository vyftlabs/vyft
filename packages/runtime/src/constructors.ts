import {
  type Provider,
  type ResourceEntry,
  type ResourceOptions,
  createRef,
  resource,
} from "@vyft/core";
import type { Linkable } from "@vyft/core";
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
  link?: Linkable[];
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

function linkEnvPrefix(urn: string): string {
  // Extract the resource id from the URN (last segment)
  // urn:vyft:resource:runtime:service:db → DB
  const parts = urn.split(":");
  const id = parts[parts.length - 1] ?? "";
  return id.toUpperCase().replace(/-/g, "_");
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
  (id, config) => {
    const env: Record<string, string> = {
      PORT: String(config.port ?? 3000),
      NODE_ENV: "production",
      ...config.env,
    };

    // Refs are branded objects that sealInput converts to serialized envelopes.
    // They resolve to strings at deploy time, but at config time they aren't strings.
    const envWithRefs = env as Record<string, unknown>;
    if (config.link) {
      for (const ref of config.link) {
        const prefix = linkEnvPrefix(ref.urn);
        envWithRefs[`${prefix}_HOST`] = createRef(ref.urn, "host");
        envWithRefs[`${prefix}_PORT`] = createRef(ref.urn, "port");
        envWithRefs[`${prefix}_URL`] = createRef(ref.urn, "url");
      }
    }

    return {
      name: id,
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
  (id, config) => ({
    name: id,
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
  (id, config) => ({
    name: id,
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
