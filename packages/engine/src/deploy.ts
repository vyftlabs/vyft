import type { Resource, ResourceState, Runtime } from "@vyft/core";
import { fingerprint, serializeConfig } from "@vyft/core";
import { isSecretOutput } from "@vyft/platform";
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
  readonly secretOutputs: Map<string, Record<string, string>>;
}

/** Extract the config portion (inputs) from a resource, replacing nested resources with IDs. */
function buildInputs(resource: Resource): Record<string, unknown> {
  if (resource.kind === "provider") {
    return serializeConfig(resource.input as Record<string, unknown>);
  }
  return serializeConfig(resource.config);
}

/** Build outputs for a resource based on its kind. */
function buildOutputs(resource: Resource): Record<string, unknown> {
  if (resource.kind === "service") {
    return { host: resource.host, port: resource.port, url: resource.url };
  }
  if (resource.kind === "provider") {
    return resource.output as Record<string, unknown>;
  }
  return {};
}

/** Separate secret-wrapped values from outputs, replacing them with placeholders. */
export function separateSecretOutputs(outputs: Record<string, unknown>): {
  plain: Record<string, unknown>;
  secrets: Record<string, string>;
} {
  const plain: Record<string, unknown> = {};
  const secrets: Record<string, string> = {};
  for (const [key, value] of Object.entries(outputs)) {
    if (isSecretOutput(value)) {
      plain[key] = "[secret]";
      secrets[key] = value.value;
    } else {
      plain[key] = value;
    }
  }
  return { plain, secrets };
}

/** Build full ResourceState for a single resource. */
function buildResourceState(
  resource: Resource,
  graph: Graph,
  previousMap: Map<string, ResourceState>,
  now: string,
): { state: ResourceState; secrets: Record<string, string> } {
  const prev = previousMap.get(resource.id);
  const deps = graph.dependencies.get(resource.id);
  const { plain, secrets } = separateSecretOutputs(buildOutputs(resource));
  return {
    state: {
      id: resource.id,
      kind: resource.kind,
      fingerprint: fingerprint(resource),
      inputs: buildInputs(resource),
      outputs: plain,
      dependencies: deps ? [...deps] : [],
      runtime: prev?.runtime ?? {},
      created: prev?.created ?? now,
      modified: now,
      taint: false,
    },
    secrets,
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

  // Resolve mountable resources (e.g., archive runs glob + computes content hash)
  for (const r of resources) {
    const rec = r as unknown as Record<string, unknown>;
    if (typeof rec["resolve"] === "function") {
      await (rec["resolve"] as () => Promise<void>)();
    }
  }

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
          const { state } = buildResourceState(
            resource,
            graph,
            previousMap,
            now,
          );
          await onState({ type: "committed", id: event.id, state });
        } else {
          await onState({ type: "removed", id: event.id });
        }
      }
    : undefined;

  const changes = plan(order(graph), previous, taintedIds);
  await execute(changes, runtime, graph, hook);

  const secretOutputs = new Map<string, Record<string, string>>();
  const state: ResourceState[] = resources.map((r) => {
    const { state: rs, secrets } = buildResourceState(
      r,
      graph,
      previousMap,
      now,
    );
    if (Object.keys(secrets).length > 0) {
      secretOutputs.set(r.id, secrets);
    }
    return rs;
  });

  return { state, secretOutputs };
}
