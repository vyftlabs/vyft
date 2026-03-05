import type {
  CronJob,
  CronJobConfig,
  Resource,
  ResourceState,
  Service,
  ServiceConfig,
  Variable,
  VariableConfig,
  Volume,
  VolumeConfig,
} from "@vyft/core";
import { buildURN, INTERNAL, MOUNTABLE, parseURN } from "@vyft/core";
import type { Change } from "@vyft/engine";
import {
  buildGraph,
  collect,
  fingerprint,
  plan,
  resourceURN,
  serializeConfig,
  validate,
} from "@vyft/engine";
import type { Operation } from "@vyft/runtime";

// ── Resource constructors ────────────────────────────────────────────

export function volume(id: string, config: VolumeConfig = {}): Volume {
  return {
    kind: "volume",
    id,
    urn: buildURN("platform", "default", "volume", id),
    config,
    [MOUNTABLE]: true,
  };
}

export function variable(id: string, config: VariableConfig = {}): Variable {
  return {
    kind: "variable",
    id,
    urn: buildURN("platform", "default", "variable", id),
    config,
  };
}

export function service(
  id: string,
  config: ServiceConfig = { image: "test" },
): Service {
  const port = config.port ?? 3000;
  return {
    kind: "service",
    id,
    urn: buildURN("runtime", "default", "service", id),
    config,
    host: id,
    port,
    url: `http://${id}:${port}`,
    [INTERNAL]: { ready: async () => {} },
  };
}

export function cronjob(id: string, config: CronJobConfig): CronJob {
  return {
    kind: "cronjob",
    id,
    urn: buildURN("runtime", "default", "cronjob", id),
    config,
  };
}

// ── Deploy helper ────────────────────────────────────────────────────

export interface DeployResult {
  state: ResourceState[];
}

/** Minimal runtime interface for deploy helper. */
export interface DeployRuntime {
  plan?: (change: Change) => Operation[];
  execute(op: Operation): Promise<void>;
}

/** Default plan: create/update for non-remove, remove for remove. */
function defaultDeployPlan(change: Change): Operation[] {
  if (change.status === "remove") {
    const { id, resource: kind } = parseURN(change.urn);
    return [
      {
        action: "remove" as const,
        urn: change.urn,
        id,
        kind: kind as Extract<Operation, { action: "remove" }>["kind"],
      },
    ];
  }
  if (change.resource.kind === "variable") return [];
  return [
    {
      action: change.status === "create" ? "create" : "update",
      resource: change.resource,
    },
  ];
}

/**
 * Test-only deploy function.
 * Collects resources, plans changes, executes via runtime, returns new state.
 */
export async function deploy(
  config: unknown,
  previousState: ResourceState[],
  runtime: DeployRuntime,
): Promise<DeployResult> {
  const resources = collect(config);
  const graph = buildGraph(resources);
  validate(graph);

  const stateEntries = previousState.map((s) => ({
    urn: s.urn,
    fingerprint: s.fingerprint,
    inputs: s.inputs,
  }));

  const changes = plan(resources, stateEntries).flat();
  const planFn = runtime.plan?.bind(runtime) ?? defaultDeployPlan;

  for (const change of changes) {
    const ops = planFn(change);
    for (const op of ops) {
      await runtime.execute(op);
    }
  }

  const now = new Date().toISOString();
  const prevMap = new Map(previousState.map((s) => [s.urn, s]));

  const newState: ResourceState[] = resources.map((r) => {
    const urn = resourceURN(r);
    const prev = prevMap.get(urn);
    const fp = fingerprint(r);
    const rawInputs =
      r.kind === "provider"
        ? (r as Resource & { input: unknown }).input
        : r.config;

    // Derive outputs from resource properties
    let outputs: Record<string, unknown> = prev?.outputs ?? {};
    if (r.kind === "service") {
      const svc = r as Service;
      outputs = { host: svc.host, port: svc.port, url: svc.url };
    }
    const deps = graph.dependencies.get(r.id);
    const depUrns = deps
      ? [...deps].map((depId) => {
          const depResource = resources.find((res) => res.id === depId);
          return depResource ? resourceURN(depResource) : urn;
        })
      : [];
    return {
      urn,
      fingerprint: fp,
      inputs:
        rawInputs && typeof rawInputs === "object"
          ? serializeConfig(rawInputs as object)
          : {},
      outputs,
      dependencies: depUrns,
      created: prev?.created ?? now,
      modified: prev && prev.fingerprint === fp ? prev.modified : now,
      taint: false,
    };
  });

  return { state: newState };
}
