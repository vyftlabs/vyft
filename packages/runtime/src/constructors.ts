import type { Linkable, Output } from "@vyft/core";
import {
  createConstructor,
  createOutput,
  type Provider,
  type ResourceHandle,
} from "@vyft/core";

export const RUNTIME_PROVIDER_NAME = "runtime";

export type DevConfig =
  | string
  | string[]
  | {
      command: string | string[];
      env?: Record<string, string>;
      cwd?: string;
      include?: string[];
      exclude?: string[];
    };

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
  domain?: string;
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
  /** Dev command config — only used by `vyft local dev`, not deployed */
  dev?: DevConfig;
}

export interface VolumeConfig {
  size?: string;
}

export interface JobConfig {
  image?: string;
  path?: string;
  cwd?: string;
  command?: string[];
  env?: Record<string, string>;
  mounts?: Array<{ source: string; target: string }>;
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

export interface ServiceHandle extends ResourceHandle {
  host: Output;
  port: Output;
  url: Output;
}

export interface VolumeHandle extends ResourceHandle {
  name: Output;
}

function linkEnvPrefix(urn: string): string {
  // Extract the resource id from the URN (last segment)
  // urn:vyft:resource:runtime:service:db → DB
  const parts = urn.split(":");
  const id = parts[parts.length - 1] ?? "";
  return id.toUpperCase().replace(/-/g, "_");
}

const serviceConstructor = createConstructor<ServiceConfig>(
  RUNTIME_PROVIDER_NAME,
  lazyProvider,
  "service",
  (id, config) => {
    // Env starts as string values but link outputs inject Output objects.
    // sealInput handles the conversion at deploy time.
    const env: Record<string, unknown> = {
      PORT: String(config.port ?? 3000),
      ...config.env,
    };

    if (config.link) {
      for (const ref of config.link) {
        const prefix = linkEnvPrefix(ref.urn);
        env[`${prefix}_HOST`] = createOutput(ref.urn, "host");
        env[`${prefix}_PORT`] = createOutput(ref.urn, "port");
        env[`${prefix}_URL`] = createOutput(ref.urn, "url");
      }
    }

    return {
      name: id,
      image: config.image,
      path: config.path ?? (config.image ? undefined : "."),
      cwd: config.cwd,
      port: config.port ?? 3000,
      domain: config.domain,
      env,
      command: config.command,
      mounts: config.mounts,
      health: config.health,
      restart: config.restart ?? "always",
      expose: config.expose,
    };
  },
);

export function service(id: string, config?: ServiceConfig): ServiceHandle {
  return serviceConstructor(id, config) as ServiceHandle;
}

const volumeConstructor = createConstructor<VolumeConfig>(
  RUNTIME_PROVIDER_NAME,
  lazyProvider,
  "volume",
  (id, config) => ({
    name: id,
    size: config.size,
  }),
);

export function volume(id: string, config?: VolumeConfig): VolumeHandle {
  return volumeConstructor(id, config) as VolumeHandle;
}

const jobConstructor = createConstructor<JobConfig>(
  RUNTIME_PROVIDER_NAME,
  lazyProvider,
  "job",
  (id, config) => ({
    name: id,
    image: config.image,
    path: config.path ?? (config.image ? undefined : "."),
    cwd: config.cwd,
    command: config.command,
    env: config.env,
    mounts: config.mounts,
  }),
);

export function job(id: string, config?: JobConfig): ResourceHandle {
  return jobConstructor(id, config) as ResourceHandle;
}

const cronjobConstructor = createConstructor<CronJobConfig>(
  RUNTIME_PROVIDER_NAME,
  lazyProvider,
  "cronjob",
  (id, config) => ({
    name: id,
    schedule: config.schedule,
    image: config.image,
    path: config.path ?? (config.image ? undefined : "."),
    cwd: config.cwd,
    command: config.command,
    env: config.env,
    mounts: config.mounts,
    health: config.health,
    restart: config.restart ?? "on-failure",
  }),
);

export function cronjob(id: string, config?: CronJobConfig): ResourceHandle {
  return cronjobConstructor(id, config) as ResourceHandle;
}
