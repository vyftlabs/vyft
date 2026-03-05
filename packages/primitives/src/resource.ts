import { ValidationError } from "@vyft/errors";
import type { EnvValue } from "./ref.ts";
import type { URN } from "./urn.ts";

export const MOUNTABLE: unique symbol = Symbol.for("vyft:mountable");

/** Symbol for internal resource properties (hidden from IDE autocomplete). */
export const INTERNAL: unique symbol = Symbol.for("vyft:internal");

/**
 * Minimal runtime interface for ready functions.
 * Avoids circular imports with the full Runtime type.
 */
export interface ReadyRuntime {
  waitForHealthy?(resourceId: string, timeout: number): Promise<void>;
  waitForCompletion?(job: Job, timeout: number): Promise<void>;
}

/**
 * Function that waits for a resource to be ready.
 * Called by the engine during deployment with the runtime context.
 */
export type ReadyFn = (runtime: ReadyRuntime) => Promise<void>;

/**
 * A resource that can be depended on.
 * Resources with `[INTERNAL].ready` will be awaited before dependents start.
 * The symbol hides internal properties from IDE autocomplete.
 */
export interface Dependable {
  /** Resource ID for dependency tracking. */
  readonly id: string;
  /** Internal properties including optional ready function. */
  readonly [INTERNAL]: { readonly ready?: ReadyFn };
}

/**
 * Options for resource creation that control system behavior.
 * Separate from config which defines what the resource IS.
 */
export interface ResourceOptions {
  /**
   * Override the default project namespace.
   * Resources with explicit namespace are never auto-destroyed and are
   * deduped by ID (first wins) instead of erroring on duplicates.
   */
  namespace?: string;
  /**
   * Parent resource for scoping. The resource ID becomes `{parent}:{id}`.
   * Can be a string ID or a resource object with an `id` property.
   */
  parent?: string | { id: string };
}

export interface Mountable {
  readonly [MOUNTABLE]: true;
  readonly kind: string;
  readonly id: string;
}

export interface BindMount {
  readonly kind: "bind";
  readonly id: string;
  readonly hostPath: string;
  readonly [MOUNTABLE]: true;
}

const ID_RE = /^[a-z][a-z0-9-]*[a-z0-9]$|^[a-z]$/;
const ROUTE_RE =
  /^(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(\/.+)?$/;
const DURATION_RE = /^\d+(ms|s|m|h)$/;
const CRON_RE = /^(\S+\s+){4}\S+$/;

export function validateId(id: string): void {
  if (id.length === 0) throw new ValidationError(`Resource ID cannot be empty`);
  if (id.length > 63)
    throw new ValidationError(`Resource ID "${id}" exceeds 63 characters`);
  if (/[A-Z]/.test(id))
    throw new ValidationError(`Resource ID "${id}" must be lowercase`);
  if (!/^[a-z]/.test(id))
    throw new ValidationError(`Resource ID "${id}" must start with a letter`);
  if (!ID_RE.test(id))
    throw new ValidationError(
      `Resource ID "${id}" must be lowercase alphanumeric with hyphens`,
    );
}

export function validateRoute(route: string): void {
  if (route.length === 0) throw new ValidationError(`Route cannot be empty`);
  if (!ROUTE_RE.test(route))
    throw new ValidationError(
      `Invalid route "${route}": must be a valid domain with optional path`,
    );
}

export function validateDuration(field: string, value: string): void {
  if (!DURATION_RE.test(value)) {
    throw new ValidationError(
      `Invalid duration "${value}" for ${field}: use a number with unit (ms, s, m, h)`,
    );
  }
}

export function validateCron(schedule: string): void {
  if (!CRON_RE.test(schedule)) {
    throw new ValidationError(
      `Invalid cron schedule "${schedule}": must be a 5-field cron expression`,
    );
  }
}

export interface VolumeConfig {
  /** Storage capacity hint, e.g. `"10Gi"`. Enforcement depends on the runtime. */
  size?: string;
}

export interface GeneratedSecretConfig {
  /** @default true */
  generated?: true;
  /**
   * Output length in characters.
   * @default 32
   * @minimum 1
   * @maximum 256
   */
  length?: number;
  /**
   * Character set to sample from.
   * Must contain at least 2 unique characters.
   * @default alphanumeric (a-zA-Z0-9)
   */
  alphabet?: string;
}

/** Secret whose value is provided externally via the CLI. */
export interface ProvidedSecretConfig {
  generated: false;
}

export type SecretConfig = GeneratedSecretConfig | ProvidedSecretConfig;

export interface PlainVariableConfig {
  secret?: false;
}

export type VariableConfig =
  | (GeneratedSecretConfig & { secret: true })
  | (ProvidedSecretConfig & { secret: true })
  | PlainVariableConfig;

/** A variable value — plain or encrypted (secret). */
export interface Variable {
  readonly kind: "variable";
  readonly id: string;
  readonly urn?: URN;
  readonly config: VariableConfig;
}

/** Check whether a VariableConfig represents a secret (encrypted) value. */
export function isSecretVariable(
  cfg: VariableConfig,
): cfg is
  | (GeneratedSecretConfig & { secret: true })
  | (ProvidedSecretConfig & { secret: true }) {
  return (cfg as { secret?: boolean }).secret === true;
}

/** @deprecated Use Variable instead. */
export type Config = Variable;
/** @deprecated Use Variable instead. */
export type Secret = Variable;
/** @deprecated Use VariableConfig instead. */
export type ConfigConfig = VariableConfig;
/** @deprecated Use PlainVariableConfig instead. */
export type PlainConfigConfig = PlainVariableConfig;
/** @deprecated Use isSecretVariable instead. */
export const isSecretConfig = isSecretVariable;

export interface HealthCheck {
  /** Shell command executed inside the container. Exit 0 = healthy. */
  command: string;
  /** Time between checks, e.g. `"10s"`. */
  interval?: string;
  /** Max time for a single check, e.g. `"5s"`. */
  timeout?: string;
  /** Consecutive failures before unhealthy. */
  retries?: number;
  /** Grace period before first check, e.g. `"30s"`. */
  startPeriod?: string;
}

/** Directory path or explicit build config. */
export type BuildConfig =
  | string
  | {
      context: string;
      /** App directory or Dockerfile path relative to context. @default "." */
      path?: string;
    };

// Non-spec fields (route, replicas, dev, dependsOn) are listed in
// src/runtimes/diff.ts NON_SPEC_FIELDS — update that set when adding fields
// that don't affect the container/pod spec.
interface BaseServiceConfig {
  /**
   * Container port the service listens on.
   * @default 3000
   * @minimum 1
   * @maximum 65535
   */
  port?: number;
  /** Public domain/path for reverse proxy routing, e.g. `"api.example.com/v1"`. */
  route?: string;
  /** Environment variables. Values can be strings, secrets, or interpolations. */
  env?: Record<string, EnvValue>;
  /** Override the container entrypoint. Array form bypasses shell interpretation. */
  command?: string | string[];
  /** Volume mounts into the container. */
  mounts?: { source: Mountable; path: string }[];
  /** Resources that must be ready before this one starts. Services wait for healthy; jobs wait for completion. */
  dependsOn?: Dependable[];
  health?: HealthCheck;
  /** @default "always" */
  restart?: "none" | "on-failure" | "always";
  /**
   * Number of replicas. Docker runtime warns if > 1.
   * @default 1
   * @minimum 1
   */
  replicas?: number;
  /** Local development override. Runs this command instead of the container. */
  dev?: { cwd?: string; command: string };
  /** Bind the container port to the host. `true` = same as container port, or specify a host port number. */
  expose?: boolean | number;
  /** Linkable services whose bindings are injected as env vars. Can also accept raw Service objects for simple dependencies. */
  link?: (Linkable | Service)[];
}

/**
 * - `image` — pull from a registry, e.g. `"postgres:17"`
 * - `build` — build from source, e.g. `"./apps/api"` (defaults to `"."`)
 */
export type ServiceConfig = BaseServiceConfig & {
  image?: string;
  build?: BuildConfig;
};

/** Persistent storage. */
export interface Volume {
  readonly kind: "volume";
  readonly id: string;
  readonly urn?: URN;
  readonly config: VolumeConfig;
  readonly options?: ResourceOptions;
  readonly [MOUNTABLE]: true;
}

/** A long-running container. */
export interface Service extends Dependable {
  readonly kind: "service";
  readonly id: string;
  readonly urn?: URN;
  readonly config: ServiceConfig;
  readonly options?: ResourceOptions;
  /** Internal DNS hostname (equals `id`). */
  readonly host: string;
  /** Resolved listening port. */
  readonly port: number;
  /** Internal URL, e.g. `http://api:3000`. */
  readonly url: string;
}

interface BaseJobConfig {
  /** Environment variables. Values can be strings, secrets, or interpolations. */
  env?: Record<string, EnvValue>;
  /** Override the container entrypoint. Array form bypasses shell interpretation. */
  command?: string | string[];
  /** Volume mounts into the container. */
  mounts?: { source: Mountable; path: string }[];
  /** Resources that must be ready before this job runs. */
  dependsOn?: Dependable[];
  /**
   * Number of retry attempts on failure.
   * @default 0
   */
  retries?: number;
  /** Linkable services whose bindings are injected as env vars. Can also accept raw Service objects for simple dependencies. */
  link?: (Linkable | Service)[];
}

interface BaseCronJobConfig {
  // 5-field cron expression, e.g. "0 3 * * *" (daily at 3am).
  schedule: string;
  /** Environment variables. Values can be strings, secrets, or interpolations. */
  env?: Record<string, EnvValue>;
  /** Override the container entrypoint. Array form bypasses shell interpretation. */
  command?: string | string[];
  /** Volume mounts into the container. */
  mounts?: { source: Mountable; path: string }[];
  /** Resources that must be ready before this cronjob runs. */
  dependsOn?: Dependable[];
  health?: HealthCheck;
  /** @default "on-failure" */
  restart?: "none" | "on-failure";
  /** Linkable services whose bindings are injected as env vars. Can also accept raw Service objects for simple dependencies. */
  link?: (Linkable | Service)[];
}

/**
 * At least one of `image` or `build` is required.
 * - `image` — pull from a registry, e.g. `"alpine:latest"`
 * - `build` — build from source, e.g. `"./apps/worker"`
 */
export type JobConfig = BaseJobConfig &
  (
    | { image: string; build?: BuildConfig }
    | { image?: string; build: BuildConfig }
  );

/** A one-time container that runs to completion. */
export interface Job extends Dependable {
  readonly kind: "job";
  readonly id: string;
  readonly urn?: URN;
  readonly config: JobConfig;
  readonly options?: ResourceOptions;
}

/**
 * At least one of `image` or `build` is required.
 * - `image` — pull from a registry, e.g. `"alpine:latest"`
 * - `build` — build from source, e.g. `"./apps/worker"`
 */
export type CronJobConfig = BaseCronJobConfig &
  (
    | { image: string; build?: BuildConfig }
    | { image?: string; build: BuildConfig }
  );

/** A container that runs a command on a cron schedule. */
export interface CronJob {
  readonly kind: "cronjob";
  readonly id: string;
  readonly urn?: URN;
  readonly config: CronJobConfig;
  readonly options?: ResourceOptions;
}

export interface Linkable {
  readonly id: string;
  readonly service: Service;
  readonly [key: string]: unknown;
}

/**
 * A resource managed by a provider (e.g., std.crypto.randomString).
 * Created when calling provider resource functions within a collection context.
 */
export interface ProviderResource<O = unknown> {
  readonly kind: "provider";
  readonly id: string;
  readonly urn?: URN;
  /** Provider name (e.g., "std") */
  readonly provider: string;
  /** Resource type within the provider (e.g., "randomString") */
  readonly type: string;
  /** Input passed when creating the resource */
  readonly input: unknown;
  /** Output accessor - values resolved at deploy time */
  readonly output: O;
}

export type Resource =
  | Volume
  | Variable
  | Service
  | Job
  | CronJob
  | ProviderResource;
