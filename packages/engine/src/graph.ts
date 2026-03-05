import type {
  Binding,
  BindValue,
  CronJob,
  Dependable,
  EnvValue,
  Job,
  Resource,
  Service,
} from "@vyft/primitives";
import { MOUNTABLE } from "@vyft/primitives";

/** Resolve a Dependable to the underlying resource ID. */
function resolveDep(dep: Dependable): string {
  return dep.id;
}

export type BindingLeaf = { kind: "leaf"; value: BindValue };
export type BindingTree =
  | BindingLeaf
  | { kind: "node"; children: Record<string, BindingTree> };

/** Recursively walk a config tree and collect `{ kind: "binding" }` objects, preserving nesting. */
export function collectBindings(config: unknown): Record<string, BindingTree> {
  const result: Record<string, BindingTree> = {};

  function walk(
    obj: Record<string, unknown>,
    target: Record<string, BindingTree>,
  ): void {
    for (const [key, val] of Object.entries(obj)) {
      if (
        val &&
        typeof val === "object" &&
        (val as { kind?: string }).kind === "binding"
      ) {
        target[key] = { kind: "leaf", value: (val as Binding).value };
      } else if (
        val &&
        typeof val === "object" &&
        !Array.isArray(val) &&
        !(val as { kind?: string }).kind
      ) {
        const children: Record<string, BindingTree> = {};
        walk(val as Record<string, unknown>, children);
        if (Object.keys(children).length > 0) {
          target[key] = { kind: "node", children };
        }
      }
    }
  }

  if (config && typeof config === "object") {
    walk(config as Record<string, unknown>, result);
  }
  return result;
}

export interface Graph {
  readonly resources: Map<string, Resource>;
  readonly dependencies: Map<string, Set<string>>;
}

/** Recursively discover all Resource objects in a value tree. */
export function collect(value: unknown): Resource[] {
  const found: Resource[] = [];
  const seen = new WeakSet<object>();

  function walk(v: unknown): void {
    if (v === null || v === undefined || typeof v !== "object") return;
    if (seen.has(v)) return;
    seen.add(v);

    const obj = v as Record<string, unknown>;
    const kind = obj["kind"];
    // Bind mounts are not deployable resources, just references in service mounts
    if (kind === "bind") {
      // Skip - bind mounts don't have config and aren't managed
    } else if (
      kind === "volume" ||
      kind === "secret" ||
      kind === "variable" ||
      kind === "config" ||
      kind === "service" ||
      kind === "job" ||
      kind === "cronjob"
    ) {
      found.push(v as Resource);
    } else if (typeof v === "object" && v !== null && MOUNTABLE in v) {
      // Catch-all for other MOUNTABLE resources (e.g. Archive from @vyft/fs)
      found.push(v as Resource);
    }

    for (const child of Array.isArray(v)
      ? (v as unknown[])
      : Object.values(obj)) {
      walk(child);
    }
  }

  walk(value);
  return found;
}

/** Extract variable/config IDs referenced in an env value. */
function refsIn(value: EnvValue, out: Set<string>): void {
  if (typeof value === "string") return;
  const kind = (value as { kind: string }).kind;
  if (kind === "variable" || kind === "config") {
    out.add((value as { id: string }).id);
  } else if (kind === "provider-output") {
    out.add((value as { resourceId: string }).resourceId);
  } else if (kind === "interpolation") {
    for (const v of (value as { values: readonly unknown[] }).values) {
      if (typeof v === "string") continue;
      const vk = (v as { kind: string }).kind;
      if (vk === "variable" || vk === "config") {
        out.add((v as { id: string }).id);
      } else if (vk === "provider-output") {
        out.add((v as { resourceId: string }).resourceId);
      }
    }
  }
}

/** Extract all resource IDs a service depends on. */
function depsOf(svc: Service): Set<string> {
  const deps = new Set<string>();
  if (svc.config.dependsOn) {
    for (const dep of svc.config.dependsOn) deps.add(resolveDep(dep));
  }
  if (svc.config.mounts) {
    for (const m of svc.config.mounts) {
      // Skip bind mounts - they're not managed resources
      if (m.source.kind !== "bind") deps.add(m.source.id);
    }
  }
  if (svc.config.env) {
    for (const v of Object.values(svc.config.env)) refsIn(v, deps);
  }
  return deps;
}

/** Extract all resource IDs a job depends on. */
function jobDepsOf(job: Job): Set<string> {
  const deps = new Set<string>();
  if (job.config.dependsOn) {
    for (const dep of job.config.dependsOn) deps.add(resolveDep(dep));
  }
  if (job.config.mounts) {
    for (const m of job.config.mounts) {
      // Skip bind mounts - they're not managed resources
      if (m.source.kind !== "bind") deps.add(m.source.id);
    }
  }
  if (job.config.env) {
    for (const v of Object.values(job.config.env)) refsIn(v, deps);
  }
  return deps;
}

/** Extract all resource IDs a cronjob depends on. */
function cronDepsOf(cron: CronJob): Set<string> {
  const deps = new Set<string>();
  if (cron.config.dependsOn) {
    for (const dep of cron.config.dependsOn) deps.add(resolveDep(dep));
  }
  if (cron.config.mounts) {
    for (const m of cron.config.mounts) {
      // Skip bind mounts - they're not managed resources
      if (m.source.kind !== "bind") deps.add(m.source.id);
    }
  }
  if (cron.config.env) {
    for (const v of Object.values(cron.config.env)) refsIn(v, deps);
  }
  return deps;
}

/** Build a dependency graph from a set of resources. */
export function buildGraph(resources: Resource[]): Graph {
  const resourceMap = new Map<string, Resource>();
  const dependencies = new Map<string, Set<string>>();

  for (const r of resources) {
    resourceMap.set(r.id, r);
    let deps: Set<string>;
    switch (r.kind) {
      case "service":
        deps = depsOf(r);
        break;
      case "job":
        deps = jobDepsOf(r);
        break;
      case "cronjob":
        deps = cronDepsOf(r);
        break;
      default:
        deps = new Set<string>();
    }
    dependencies.set(r.id, deps);
  }

  return { resources: resourceMap, dependencies };
}
