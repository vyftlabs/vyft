import type { Linkable, Mountable, Output } from "@vyft/core";
import {
  createConstructor,
  createOutput,
  DEPENDABLE,
  type Provider,
  type ResourceEntry,
  registry,
  urn,
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
  start?: string;
  port?: number;
  domain?: string;
  env?: Record<string, string | Output<string>>;
  command?: string[];
  mounts?: Array<{ source: string | Mountable; target: string }>;
  health?: {
    path?: string;
    command?: string;
    interval?: string;
    timeout?: string;
    retries?: number;
  };
  restart?: "always" | "on-failure" | "unless-stopped" | "no";
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
  env?: Record<string, string | Output<string>>;
  mounts?: Array<{ source: string | Mountable; target: string }>;
}

export interface CronJobConfig {
  schedule: string;
  image?: string;
  path?: string;
  cwd?: string;
  command?: string[];
  env?: Record<string, string | Output<string>>;
  mounts?: Array<{ source: string | Mountable; target: string }>;
  health?: {
    path?: string;
    command?: string;
    interval?: string;
    timeout?: string;
    retries?: number;
  };
  restart?: "always" | "on-failure" | "unless-stopped" | "no";
}

export interface ServiceOutputs {
  host: string;
  port: number;
  url: string;
}

export interface VolumeOutputs {
  name: string;
}

function linkEnvPrefix(urn: string): string {
  const parts = urn.split(":");
  const id = parts[parts.length - 1] ?? "";
  return id.toUpperCase().replace(/-/g, "_");
}

// When a service needs building, we capture the build output ref here
// before calling serviceConstructor. Safe because registration is synchronous.
let pendingBuildImage: Output<string> | undefined;

const serviceConstructor = createConstructor<ServiceConfig, ServiceOutputs>(
  RUNTIME_PROVIDER_NAME,
  lazyProvider,
  "service",
  (id, config) => {
    const buildImage = pendingBuildImage;
    pendingBuildImage = undefined;

    // Env starts as string values but link outputs inject Output objects.
    // sealInput handles the conversion at deploy time.
    const env: Record<string, unknown> = {
      PORT: String(config.port ?? 3000),
      ...config.env,
    };

    if (config.link) {
      for (const ref of config.link) {
        const refUrn = registry.urnOf(ref);
        const prefix = linkEnvPrefix(refUrn);
        env[`${prefix}_HOST`] = createOutput(refUrn, "host");
        env[`${prefix}_PORT`] = createOutput(refUrn, "port");
        env[`${prefix}_URL`] = createOutput(refUrn, "url");
      }
    }

    const mounts = config.mounts?.map((m) => ({
      source:
        typeof m.source === "string"
          ? m.source
          : createOutput(registry.urnOf(m.source), "name"),
      target: m.target,
    }));

    return {
      name: id,
      image: buildImage ?? config.image,
      port: config.port ?? 3000,
      domain: config.domain,
      env,
      command: config.command,
      mounts,
      health: config.health,
      restart: config.restart ?? "always",
    };
  },
  { linkable: true },
);

export function service(id: string, config?: ServiceConfig) {
  const resolvedConfig = config ?? {};
  const needsBuild = !resolvedConfig.image;
  const buildPath = resolvedConfig.path ?? (needsBuild ? "." : undefined);

  if (buildPath) {
    const buildUrn = urn.build("resource", RUNTIME_PROVIDER_NAME, "build", id);
    const buildEntry: ResourceEntry = {
      [DEPENDABLE]: true,
      urn: buildUrn,
      value: {
        name: id,
        path: buildPath,
        cwd: resolvedConfig.cwd,
        start: resolvedConfig.start,
      },
      provider: lazyProvider,
    };
    registry.register(buildEntry);
    pendingBuildImage = createOutput(buildUrn, "image");
  }

  return serviceConstructor(id, resolvedConfig);
}

const volumeConstructor = createConstructor<VolumeConfig, VolumeOutputs>(
  RUNTIME_PROVIDER_NAME,
  lazyProvider,
  "volume",
  (id, config) => ({
    name: id,
    size: config.size,
  }),
  { mountable: true },
);

export function volume(id: string, config?: VolumeConfig) {
  return volumeConstructor(id, config);
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

export function job(id: string, config?: JobConfig) {
  return jobConstructor(id, config);
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

export function cronjob(id: string, config?: CronJobConfig) {
  return cronjobConstructor(id, config);
}
