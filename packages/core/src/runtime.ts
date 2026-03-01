import type { Change } from "./plan.ts";
import type { Resource, Service } from "./resource.ts";

/** A concrete operation the runtime will perform. */
export type Operation =
  | { action: "create"; resource: Resource }
  | { action: "update"; resource: Resource }
  | { action: "recreate"; resource: Resource }
  | { action: "remove"; id: string; kind: Resource["kind"] | "secret" };

/** Options passed to runtime factories. */
export interface RuntimeOptions {
  project: string;
  secrets: ReadonlyMap<string, string>;
}

/** Runtime target for deploying resources (e.g. Docker). */
export interface Runtime {
  /** Translate a detected change into concrete operations. */
  plan(change: Change): Operation[];
  /** Execute a single operation. */
  execute(op: Operation): Promise<void>;
  /** Poll until a service is healthy. Resolves immediately if no health check configured. */
  waitForHealthy?(resourceId: string, timeout: number): Promise<void>;
  /** Inspect a live resource. Returns null if not found; normalized config otherwise. */
  inspect?(
    id: string,
    kind: Resource["kind"],
  ): Promise<Record<string, unknown> | null>;
}

/** Extended runtime with post-deploy hooks used by CLI commands. */
export interface ExtendedRuntime extends Runtime {
  /** Post-deploy hook — e.g. update proxy config for current services. */
  finalize(currentServices: Service[]): Promise<void>;
  /** Full teardown — remove infrastructure (networks, namespaces, etc.). */
  teardown(): Promise<void>;
  /** Runtime-specific state per resource (e.g. containerId, PVC name). */
  runtimeState(): Map<string, Record<string, unknown>>;
}
