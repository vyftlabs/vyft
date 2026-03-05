/**
 * Resource constructor functions — the user-facing API for defining infrastructure.
 *
 * These functions create typed resource objects and register them
 * with the active collector (so `collect()` can discover them).
 */

import { ValidationError } from "@vyft/errors";
import { collect, currentCollector, currentParent } from "./collector.ts";
import type { Binding, BindValue, ConfigOptions } from "./primitives.ts";
import type { EnvValue } from "./ref.ts";
import type {
  BindMount,
  Config,
  ConfigConfig,
  CronJob,
  CronJobConfig,
  Dependable,
  Job,
  JobConfig,
  Linkable,
  ReadyFn,
  ReadyRuntime,
  ResourceOptions,
  Service,
  ServiceConfig,
  Volume,
  VolumeConfig,
} from "./resource.ts";
import {
  INTERNAL,
  MOUNTABLE,
  validateCron,
  validateDuration,
  validateId,
  validateRoute,
} from "./resource.ts";

const DEFAULT_PORT = 3000;
const DEFAULT_SECRET_LENGTH = 32;
const MAX_SECRET_LENGTH = 256;
const DEFAULT_HEALTH_TIMEOUT = 60_000;
const DEFAULT_JOB_TIMEOUT = 10 * 60_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveId(id: string, options?: ResourceOptions): string {
  if (options?.parent) {
    const parentId =
      typeof options.parent === "string" ? options.parent : options.parent.id;
    return `${parentId}:${id}`;
  }
  const ctxParent = currentParent();
  if (ctxParent) return `${ctxParent}:${id}`;
  return id;
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
  return value;
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
    if (isService(item)) {
      deps.push(item);
      continue;
    }
    deps.push(item.service);
    const prefix = `VYFT_BINDING_${item.id.toUpperCase().replace(/-/g, "_")}`;
    for (const [key, value] of Object.entries(item)) {
      if (isBinding(value)) {
        env[`${prefix}_${key.toUpperCase()}`] = bindingToEnvValue(value.value);
      }
    }
  }
  return { env, deps };
}

// ---------------------------------------------------------------------------
// Constructors
// ---------------------------------------------------------------------------

export function volume(
  id: string,
  config: VolumeConfig = {},
  options?: ResourceOptions,
): Volume {
  const resolvedId = resolveId(id, options);
  validateId(resolvedId);
  const v = {
    kind: "volume",
    id: resolvedId,
    config,
    ...(options && { options }),
    [MOUNTABLE]: true,
  } as Volume;
  currentCollector()?.push(v);
  return v;
}

export function bind(id: string, hostPath: string): BindMount {
  validateId(id);
  return { kind: "bind", id, hostPath, [MOUNTABLE]: true } as BindMount;
}

export function config(id: string, opts: ConfigOptions = {}): Config {
  if (id.length === 0) {
    throw new ValidationError("Config ID cannot be empty");
  }
  let c: Config;
  if (opts.secret) {
    if (opts.generated === false) {
      c = { kind: "variable", id, config: { generated: false, secret: true } };
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
      c = { kind: "variable", id, config: cfg };
    }
  } else {
    c = { kind: "variable", id, config: {} };
  }
  currentCollector()?.push(c);
  return c;
}

export function service(
  id: string,
  config: ServiceConfig,
  options?: ResourceOptions,
): Service {
  const resolvedId = resolveId(id, options);
  validateId(resolvedId);

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

  if (!finalConfig.image && !finalConfig.path) {
    finalConfig = { ...finalConfig, path: "." };
  }

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

  const svc = {
    kind: "service",
    id: resolvedId,
    config: finalConfig,
    ...(options && { options }),
    host: resolvedId,
    port,
    url: `http://${resolvedId}:${port}`,
    [INTERNAL]: {
      ready: async (runtime: ReadyRuntime) => {
        if (runtime.waitForHealthy) {
          await runtime.waitForHealthy(resolvedId, DEFAULT_HEALTH_TIMEOUT);
        }
      },
    },
  } as Service;
  currentCollector()?.push(svc);
  return svc;
}

export function job(
  id: string,
  config: JobConfig,
  options?: ResourceOptions,
): Job {
  const resolvedId = resolveId(id, options);
  validateId(resolvedId);

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

  const j = {
    kind: "job",
    id: resolvedId,
    config: finalConfig,
    ...(options && { options }),
    [INTERNAL]: {
      ready: async (runtime: ReadyRuntime) => {
        if (runtime.waitForCompletion) {
          await runtime.waitForCompletion(j as Job, DEFAULT_JOB_TIMEOUT);
        }
      },
    },
  } as Job;
  currentCollector()?.push(j);
  return j;
}

export function cronjob(
  id: string,
  config: CronJobConfig,
  options?: ResourceOptions,
): CronJob {
  const resolvedId = resolveId(id, options);
  validateId(resolvedId);

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

// ---------------------------------------------------------------------------
// Composite resources
// ---------------------------------------------------------------------------

interface ResourceInternal {
  ready?: ReadyFn;
  beforeDelete?: () => void;
  afterDelete?: () => void;
}

export interface ResourceDefinition<T> {
  outputs: T;
  /** Resources that must be ready before dependents start. */
  ready?: Dependable | Dependable[] | undefined;
  beforeDelete?: (() => void) | undefined;
  afterDelete?: (() => void) | undefined;
}

type Prettify<T> = { [K in keyof T]: T[K] } & {};

export type CompositeResource<T> = T & Dependable & {
  readonly [INTERNAL]: ResourceInternal;
};

export function resource<C, Outputs>(
  type: string,
  define: (id: string, config: C) => Prettify<ResourceDefinition<Outputs>>,
): (name: string, config?: C) => CompositeResource<Outputs> {
  return (name: string, config?: C): CompositeResource<Outputs> => {
    const id = `${type}-${name}`;
    validateId(id);

    const { result, resources } = collect(() => define(id, config as C), id);

    const parent = currentCollector();
    if (parent) {
      for (const r of resources) {
        parent.push(r);
      }
    }

    const { outputs, ready: readyInput, ...internal } = result;

    let ready: ReadyFn | undefined;
    if (readyInput) {
      const deps = Array.isArray(readyInput) ? readyInput : [readyInput];
      const fns = deps
        .map((d) => d[INTERNAL].ready)
        .filter((f): f is ReadyFn => f != null);
      if (fns.length === 1) {
        ready = fns[0];
      } else if (fns.length > 1) {
        ready = (rt) => Promise.all(fns.map((f) => f(rt))).then(() => {});
      }
    }

    return {
      id,
      ...outputs,
      [INTERNAL]: { ...internal, ready },
    } as CompositeResource<Outputs>;
  };
}
