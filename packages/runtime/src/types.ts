import type { Job, Resource, Service, URN } from "@vyft/primitives";

/** A concrete operation the runtime will perform. */
export type Operation =
  | { action: "create"; resource: Resource }
  | { action: "update"; resource: Resource }
  | { action: "remove"; urn: URN; id: string; kind: string };

/** Image build utilities — injected by the CLI to avoid circular deps. */
export interface ImageUtils {
  buildImage(
    tag: string,
    buildPath: string,
    buildCwd?: string,
  ): Promise<{ tag: string; digest: string }>;
  pushImage(localTag: string, remoteTag: string): Promise<void>;
}

/** Options passed to runtime factories. */
export interface RuntimeOptions {
  project: string;
  stage: string;
  secrets: ReadonlyMap<string, string>;
  imageUtils?: ImageUtils;
}

/** Runtime target for deploying resources (e.g. Docker). */
export interface Runtime {
  /** Execute a single operation. */
  execute(op: Operation): Promise<void>;
  /** Poll until a service is healthy. */
  waitForHealthy?(resourceId: string, timeout: number): Promise<void>;
  /** Wait until a job completes successfully (exit 0). */
  waitForCompletion?(job: Job, timeout: number): Promise<void>;
  /** Inspect a live resource. Returns null if not found. */
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
