import type {
  BindMount,
  Config,
  ConfigConfig,
  CronJob,
  CronJobConfig,
  EnvValue,
  Interpolation,
  Job,
  JobConfig,
  Linkable,
  ReadyFn,
  Reference,
  ResourceOptions,
  Service,
  ServiceConfig,
  Volume,
  VolumeConfig,
} from "@vyft/core";

// Platform contracts
export * from "./contracts.ts";
export type { BrandedHandler, PlatformBuilder, PlatformInit } from "./init.ts";
export { initPlatform } from "./init.ts";

import {
  collect,
  currentCollector,
  currentParent,
  INTERNAL,
  MOUNTABLE,
  ValidationError,
  validateCron,
  validateDuration,
  validateId,
  validateRoute,
} from "@vyft/core";

export type BindValue = string | number | Reference | Interpolation;

export interface Binding {
  readonly kind: "binding";
  readonly value: BindValue;
}

export function bindable(value: BindValue): Binding {
  return { kind: "binding", value };
}

export interface SecretOutput {
  readonly kind: "secret";
  readonly value: string;
}

export function secret(value: string): SecretOutput {
  return { kind: "secret", value };
}

export function isSecretOutput(value: unknown): value is SecretOutput {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as SecretOutput).kind === "secret"
  );
}

const DEFAULT_PORT = 3000;
const DEFAULT_SECRET_LENGTH = 32;
const MAX_SECRET_LENGTH = 256;

/**
 * Create a persistent volume.
 *
 * @example
 * ```ts
 * volume("data")
 * volume("logs", { size: "10Gi" })
 * volume("shared-data", { size: "10Gi" }, { namespace: "vyft" })
 * ```
 */
export function volume(
  id: string,
  config: VolumeConfig = {},
  options?: ResourceOptions,
): Volume {
  const resolvedId = resolveId(id, options);
  validateId(resolvedId);
  const v: Volume = {
    kind: "volume",
    id: resolvedId,
    config,
    ...(options && { options }),
    [MOUNTABLE]: true,
  };
  currentCollector()?.push(v);
  return v;
}

/** Resolve resource ID with parent prefix if specified or from current context. */
function resolveId(id: string, options?: ResourceOptions): string {
  // Explicit parent in options takes precedence
  if (options?.parent) {
    const parentId =
      typeof options.parent === "string" ? options.parent : options.parent.id;
    return `${parentId}:${id}`;
  }
  // Fall back to current parent context (from resource() block)
  const ctxParent = currentParent();
  if (ctxParent) {
    return `${ctxParent}:${id}`;
  }
  return id;
}

export function bind(id: string, hostPath: string): BindMount {
  validateId(id);
  return { kind: "bind", id, hostPath, [MOUNTABLE]: true };
}

export interface ConfigOptions {
  /** Mark this config value as a secret (encrypted at rest). */
  secret?: boolean;
  /** Whether the secret is auto-generated. Only relevant when `secret: true`. @default true */
  generated?: boolean;
  /** Output length for generated secrets. @default 32 */
  length?: number;
  /** Character set for generated secrets. Must have at least 2 characters. */
  alphabet?: string;
}

/**
 * Create a config value. Plain by default; set `secret: true` for encrypted values.
 *
 * @example
 * ```ts
 * config("db-url")
 * config("db-password", { secret: true })
 * config("api-key", { secret: true, generated: false })
 * config("token", { secret: true, length: 64, alphabet: "0123456789abcdef" })
 * ```
 */
export function config(id: string, opts: ConfigOptions = {}): Config {
  // Config IDs can be uppercase (e.g., DATABASE_URL) unlike resource IDs
  if (id.length === 0) {
    throw new ValidationError("Config ID cannot be empty");
  }
  let c: Config;
  if (opts.secret) {
    if (opts.generated === false) {
      c = { kind: "config", id, config: { generated: false, secret: true } };
    } else {
      const length = opts.length ?? DEFAULT_SECRET_LENGTH;
      if (
        length < 1 ||
        length > MAX_SECRET_LENGTH ||
        !Number.isInteger(length)
      ) {
        throw new ValidationError(
          `Config "${id}" length must be an integer between 1 and ${MAX_SECRET_LENGTH}`,
        );
      }
      if (opts.alphabet !== undefined && opts.alphabet.length < 2) {
        throw new ValidationError(
          `Config "${id}" alphabet must have at least 2 characters`,
        );
      }
      const cfg: ConfigConfig =
        opts.alphabet !== undefined
          ? { secret: true, length, alphabet: opts.alphabet }
          : { secret: true, length };
      c = { kind: "config", id, config: cfg };
    }
  } else {
    c = { kind: "config", id, config: {} };
  }
  currentCollector()?.push(c);
  return c;
}

function isBinding(value: unknown): value is Binding {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Binding).kind === "binding"
  );
}

function bindingToEnvValue(value: BindValue): EnvValue {
  if (typeof value === "number") return String(value);
  return value; // string | Reference | Interpolation are already EnvValue
}

function isService(value: unknown): value is Service {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Service).kind === "service"
  );
}

function expandLink(linkItems: (Linkable | Service)[]): {
  env: Record<string, EnvValue>;
  deps: Service[];
} {
  const env: Record<string, EnvValue> = {};
  const deps: Service[] = [];
  for (const item of linkItems) {
    // Handle raw Service objects (simple dependency)
    if (isService(item)) {
      deps.push(item);
      continue;
    }
    // Handle Linkable objects (with bindings)
    deps.push(item.service);
    const prefix = `VYFT_BINDING_${item.id.toUpperCase().replace(/-/g, "_")}`;
    for (const [key, value] of Object.entries(item)) {
      if (isBinding(value)) {
        const envName = `${prefix}_${key.toUpperCase()}`;
        env[envName] = bindingToEnvValue(value.value);
      }
    }
  }
  return { env, deps };
}

/**
 * Create a long-running service.
 *
 * @example
 * ```ts
 * service("api", { build: "./apps/api", route: "api.example.com" })
 * service("db", { image: "postgres:17", port: 5432 })
 * service("minio", { image: "minio/minio" }, { namespace: "vyft", shared: true })
 * ```
 */
export function service(
  id: string,
  config: ServiceConfig,
  options?: ResourceOptions,
): Service {
  const resolvedId = resolveId(id, options);
  validateId(resolvedId);

  // Expand link items into env vars and dependsOn, then strip link from config
  const { link: linkItems, ...restConfig } = config;
  let finalConfig: ServiceConfig = restConfig;
  if (linkItems) {
    const { env, deps } = expandLink(linkItems);
    finalConfig = {
      ...restConfig,
      env: { ...env, ...restConfig.env },
      dependsOn: [...deps, ...(restConfig.dependsOn ?? [])],
    };
  }

  // Default to building from current directory when neither image nor build is set
  if (!finalConfig.image && !finalConfig.build) {
    finalConfig = { ...finalConfig, build: "." };
  }

  // Inject PORT and NODE_ENV env vars
  const port = finalConfig.port ?? DEFAULT_PORT;
  finalConfig = {
    ...finalConfig,
    env: { PORT: String(port), NODE_ENV: "production", ...finalConfig.env },
  };

  if (finalConfig.route !== undefined) validateRoute(finalConfig.route);
  if (port < 1 || port > 65535 || !Number.isInteger(port)) {
    throw new ValidationError(
      `Service "${resolvedId}" port must be an integer between 1 and 65535`,
    );
  }
  if (finalConfig.health) {
    if (finalConfig.health.interval !== undefined)
      validateDuration("health.interval", finalConfig.health.interval);
    if (finalConfig.health.timeout !== undefined)
      validateDuration("health.timeout", finalConfig.health.timeout);
    if (finalConfig.health.startPeriod !== undefined)
      validateDuration("health.startPeriod", finalConfig.health.startPeriod);
  }
  const DEFAULT_HEALTH_TIMEOUT = 60_000; // 60 seconds

  const svc: Service = {
    kind: "service",
    id: resolvedId,
    config: finalConfig,
    ...(options && { options }),
    host: resolvedId,
    port,
    url: `http://${resolvedId}:${port}`,
    [INTERNAL]: {
      ready: async (runtime) => {
        if (runtime.waitForHealthy) {
          await runtime.waitForHealthy(resolvedId, DEFAULT_HEALTH_TIMEOUT);
        }
      },
    },
  };
  currentCollector()?.push(svc);
  return svc;
}

/**
 * Create a one-time job that runs to completion.
 *
 * Jobs are containers that run once and exit. Resources that depend on a job
 * will wait for the job to complete successfully (exit 0) before starting.
 *
 * @example
 * ```ts
 * const db = service("db", { image: "postgres:17" });
 * const migrate = job("migrate", {
 *   image: "app:latest",
 *   command: ["npm", "run", "migrate"],
 *   dependsOn: [db],
 * });
 * const api = service("api", {
 *   image: "app:latest",
 *   dependsOn: [migrate], // waits for migration to complete
 * });
 *
 * // Lifecycle jobs
 * job("init", { image: "mc", command: ["mc", "mb", "..."] }, { parent: bucket, lifecycle: "create" })
 * job("cleanup", { image: "mc", command: ["mc", "rb", "..."] }, { parent: bucket, lifecycle: "destroy" })
 * ```
 */
export function job(
  id: string,
  config: JobConfig,
  options?: ResourceOptions,
): Job {
  const resolvedId = resolveId(id, options);
  validateId(resolvedId);

  // Expand link items into env vars, then strip link from config
  const { link: linkItems, ...restConfig } = config;
  let finalConfig: JobConfig = restConfig;
  if (linkItems) {
    const { env, deps } = expandLink(linkItems);
    finalConfig = {
      ...restConfig,
      env: { ...env, ...restConfig.env },
      dependsOn: [...deps, ...(restConfig.dependsOn ?? [])],
    };
  }

  const DEFAULT_JOB_TIMEOUT = 10 * 60_000; // 10 minutes

  const j: Job = {
    kind: "job",
    id: resolvedId,
    config: finalConfig,
    ...(options && { options }),
    [INTERNAL]: {
      ready: async (runtime) => {
        if (runtime.waitForCompletion) {
          await runtime.waitForCompletion(j, DEFAULT_JOB_TIMEOUT);
        }
      },
    },
  };
  currentCollector()?.push(j);
  return j;
}

/**
 * Create a scheduled job that runs on a cron schedule.
 *
 * @example
 * ```ts
 * cronjob("cleanup", { image: "alpine", schedule: "0 3 * * *", command: "rm -rf /tmp/*" })
 * ```
 */
export function cronjob(
  id: string,
  config: CronJobConfig,
  options?: ResourceOptions,
): CronJob {
  const resolvedId = resolveId(id, options);
  validateId(resolvedId);

  // Expand link items into env vars, then strip link from config
  const { link: linkItems, ...restConfig } = config;
  let finalConfig: CronJobConfig = restConfig;
  if (linkItems) {
    const { env } = expandLink(linkItems);
    finalConfig = {
      ...restConfig,
      env: { ...env, ...restConfig.env },
    };
  }

  validateCron(finalConfig.schedule);
  if (finalConfig.health) {
    if (finalConfig.health.interval !== undefined)
      validateDuration("health.interval", finalConfig.health.interval);
    if (finalConfig.health.timeout !== undefined)
      validateDuration("health.timeout", finalConfig.health.timeout);
    if (finalConfig.health.startPeriod !== undefined)
      validateDuration("health.startPeriod", finalConfig.health.startPeriod);
  }
  const cj: CronJob = {
    kind: "cronjob",
    id: resolvedId,
    config: finalConfig,
    ...(options && { options }),
  };
  currentCollector()?.push(cj);
  return cj;
}

/** Internal properties for composite resources (hidden from IDE autocomplete). */
export interface ResourceInternal {
  ready?: ReadyFn;
  beforeDelete?: () => void;
  afterDelete?: () => void;
}

/**
 * Return type for composite resource definitions.
 * Outputs are user-facing data, lifecycle hooks are optional.
 */
export interface ResourceDefinition<T> {
  /** User-facing outputs (endpoint, url, etc.) */
  outputs: T;
  /** Function called to wait for this resource to be ready. */
  ready?: ReadyFn | undefined;
  /** Function called before deleting child resources. */
  beforeDelete?: (() => void) | undefined;
  /** Function called after deleting child resources. */
  afterDelete?: (() => void) | undefined;
}

/** Flatten intersection types for cleaner IDE tooltips. */
type Prettify<T> = { [K in keyof T]: T[K] } & {};

/**
 * Result type for composite resources.
 * Outputs are flattened to top level for ergonomic access.
 * Internal properties (ready, beforeDelete, afterDelete) are hidden under INTERNAL symbol.
 */
export type CompositeResource<T> = T & {
  readonly id: string;
  readonly [INTERNAL]: ResourceInternal;
};

/**
 * Define a composite resource type that groups other primitives.
 *
 * Returns a factory function that creates instances of the resource.
 * Resources created inside are collected and bubbled up to the parent collector.
 *
 * @example
 * ```ts
 * export const bucket = resource("bucket", (id, opts?: { size?: string }) => {
 *   const svc = service("minio", { image: "minio/minio" }, { namespace: "vyft" });
 *   const init = job("init", { image: "minio/mc", dependsOn: [svc], ... });
 *
 *   return {
 *     outputs: {
 *       endpoint: svc.url,
 *       name: id,
 *     },
 *     ready: init.ready,
 *     beforeDelete: () => {
 *       job("cleanup", { image: "minio/mc", ... });
 *     },
 *   };
 * });
 *
 * // Usage:
 * const uploads = bucket("uploads", { size: "20Gi" });
 * uploads.endpoint  // typed access (visible in IDE)
 * uploads[INTERNAL].ready  // internal props hidden under symbol
 * ```
 */
export function resource<C, Outputs>(
  type: string,
  define: (id: string, config: C) => Prettify<ResourceDefinition<Outputs>>,
): (name: string, config?: C) => CompositeResource<Outputs> {
  return (name: string, config?: C): CompositeResource<Outputs> => {
    const id = `${type}-${name}`;
    validateId(id);

    // Collect with id as parent context - child resources auto-scope
    const { result, resources } = collect(() => define(id, config as C), id);

    // Bubble collected resources up to parent collector
    const parent = currentCollector();
    if (parent) {
      for (const r of resources) {
        parent.push(r);
      }
    }

    // Outputs at top level, internal props hidden under INTERNAL symbol
    const { outputs, ...internal } = result;
    return {
      id,
      ...outputs,
      [INTERNAL]: internal,
    } as CompositeResource<Outputs>;
  };
}
