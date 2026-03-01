import type { Resource, ResourceState, Runtime } from "@vyft/core";
import { fingerprint, serializeConfig } from "@vyft/core";
import type { ExecuteHook } from "./execute.ts";
import { execute } from "./execute.ts";
import type { Graph } from "./graph.ts";
import { buildGraph, collect } from "./graph.ts";
import { order } from "./order.ts";
import { plan } from "./plan.ts";
import { validate } from "./validate.ts";

export type StateEvent =
  | {
      type: "pending";
      id: string;
      operation: "creating" | "updating" | "deleting";
    }
  | { type: "committed"; id: string; state: ResourceState }
  | { type: "removed"; id: string };

export type StateHook = (event: StateEvent) => Promise<void>;

export interface DeployResult {
  readonly state: ResourceState[];
}

/** Extract the config portion (inputs) from a resource, replacing nested resources with IDs. */
function buildInputs(resource: Resource): Record<string, unknown> {
  return serializeConfig(resource.config);
}

/** Build outputs for a resource based on its kind. */
function buildOutputs(resource: Resource): Record<string, unknown> {
  if (resource.kind === "service") {
    return { host: resource.host, port: resource.port, url: resource.url };
  }
  return {};
}

/** Build full ResourceState for a single resource. */
function buildResourceState(
  resource: Resource,
  graph: Graph,
  previousMap: Map<string, ResourceState>,
  now: string,
): ResourceState {
  const prev = previousMap.get(resource.id);
  const deps = graph.dependencies.get(resource.id);
  return {
    id: resource.id,
    kind: resource.kind,
    fingerprint: fingerprint(resource),
    inputs: buildInputs(resource),
    outputs: buildOutputs(resource),
    dependencies: deps ? [...deps] : [],
    runtime: prev?.runtime ?? {},
    created: prev?.created ?? now,
    modified: now,
    taint: false,
  };
}

/** Full deploy pipeline: graph → validate → order → plan → execute. */
export async function deploy(
  config: unknown,
  previous: ResourceState[],
  runtime: Runtime,
  onState?: StateHook,
  taintedIds?: Set<string>,
): Promise<DeployResult> {
  const resources = collect(config);
  const graph = buildGraph(resources);
  validate(graph);

  const previousMap = new Map<string, ResourceState>();
  for (const entry of previous) {
    previousMap.set(entry.id, entry);
  }

  const now = new Date().toISOString();

  const hook: ExecuteHook | undefined = onState
    ? async (event) => {
        if (event.phase === "before") {
          await onState({
            type: "pending",
            id: event.id,
            operation: event.operation,
          });
        } else if (event.phase === "after") {
          const resource = graph.resources.get(event.id);
          if (!resource)
            throw new Error(`Resource "${event.id}" not found in graph`);
          const state = buildResourceState(resource, graph, previousMap, now);
          await onState({ type: "committed", id: event.id, state });
        } else {
          await onState({ type: "removed", id: event.id });
        }
      }
    : undefined;

  const changes = plan(order(graph), previous, taintedIds);
  await execute(changes, runtime, graph, hook);

  const state: ResourceState[] = resources.map((r) =>
    buildResourceState(r, graph, previousMap, now),
  );

  return { state };
}
