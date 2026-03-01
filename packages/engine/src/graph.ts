import type {
  Binding,
  BindValue,
  CronJob,
  EnvValue,
  Resource,
  Service,
} from "@vyft/core";

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
    if (
      kind === "volume" ||
      kind === "secret" ||
      kind === "service" ||
      kind === "cronjob"
    ) {
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

/** Extract secret IDs referenced in an env value. */
function refsIn(value: EnvValue, out: Set<string>): void {
  if (typeof value === "string") return;
  if (value.kind === "secret") {
    out.add(value.id);
  } else {
    for (const v of value.values) {
      if (typeof v !== "string") out.add(v.id);
    }
  }
}

/** Extract all resource IDs a service depends on. */
function depsOf(svc: Service): Set<string> {
  const deps = new Set<string>();
  if (svc.config.dependsOn) {
    for (const s of svc.config.dependsOn) deps.add(s.id);
  }
  if (svc.config.mounts) {
    for (const m of svc.config.mounts) deps.add(m.volume.id);
  }
  if (svc.config.env) {
    for (const v of Object.values(svc.config.env)) refsIn(v, deps);
  }
  return deps;
}

/** Extract all resource IDs a cronjob depends on. */
function cronDepsOf(cron: CronJob): Set<string> {
  const deps = new Set<string>();
  if (cron.config.mounts) {
    for (const m of cron.config.mounts) deps.add(m.volume.id);
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
    const deps =
      r.kind === "service"
        ? depsOf(r)
        : r.kind === "cronjob"
          ? cronDepsOf(r)
          : new Set<string>();
    dependencies.set(r.id, deps);
  }

  return { resources: resourceMap, dependencies };
}
