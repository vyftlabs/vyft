import { ValidationError } from "./errors.ts";
import type { EnvValue } from "./ref.ts";

export const MOUNTABLE: unique symbol = Symbol.for("vyft:mountable");

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

export interface PlainConfigConfig {
  secret?: false;
}

export type ConfigConfig =
  | (GeneratedSecretConfig & { secret: true })
  | (ProvidedSecretConfig & { secret: true })
  | PlainConfigConfig;

/** A config value — plain or encrypted (secret). */
export interface Config {
  readonly kind: "config";
  readonly id: string;
  readonly config: ConfigConfig;
}

/** Check whether a ConfigConfig represents a secret (encrypted) value. */
export function isSecretConfig(
  cfg: ConfigConfig,
): cfg is
  | (GeneratedSecretConfig & { secret: true })
  | (ProvidedSecretConfig & { secret: true }) {
  return (cfg as { secret?: boolean }).secret === true;
}

/** @deprecated Use Config instead. */
export type Secret = Config;

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
  /** Services that must be healthy before this one starts. */
  dependsOn?: Service[];
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
  /** Linkable services whose bindings are injected as env vars. */
  link?: Linkable[];
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
  readonly config: VolumeConfig;
  readonly [MOUNTABLE]: true;
}

/** A long-running container. */
export interface Service {
  readonly kind: "service";
  readonly id: string;
  readonly config: ServiceConfig;
  /** Internal DNS hostname (equals `id`). */
  readonly host: string;
  /** Resolved listening port. */
  readonly port: number;
  /** Internal URL, e.g. `http://api:3000`. */
  readonly url: string;
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
  health?: HealthCheck;
  /** @default "on-failure" */
  restart?: "none" | "on-failure";
  /** Linkable services whose bindings are injected as env vars. */
  link?: Linkable[];
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
  readonly config: CronJobConfig;
}

export interface Linkable {
  readonly id: string;
  readonly service: Service;
  readonly [key: string]: unknown;
}

export type Resource = Volume | Config | Service | CronJob;
