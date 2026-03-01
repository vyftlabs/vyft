import type {
  Change,
  ExtendedRuntime,
  Operation,
  Resource,
  RuntimeName,
  Service,
} from "@vyft/core";
import { changedFields, hasSpecChange } from "@vyft/core";
import { createDockerRuntime } from "@vyft/docker";
import { deploy } from "@vyft/engine";
import { createK8sRuntime } from "@vyft/kubernetes";
import type { ResourceState } from "@vyft/store";
import { createSwarmRuntime } from "@vyft/swarm";
import {
  createMockDockerClient,
  createMockK8sClient,
} from "./helpers/mocks.ts";

/** A recorded operation with its index in the execution log. */
export interface LogEntry {
  operation: Operation;
  index: number;
}

/** Predicate for matching operations in failOn. */
export type OperationPredicate = (op: Operation) => boolean;

interface Failure {
  predicate: OperationPredicate;
  error: Error;
  once: boolean;
  fired: boolean;
}

/**
 * Default plan logic with Docker semantics (recreate for spec changes,
 * no-op for non-spec-only changes) — used when no runtime-specific planFn
 * is injected.
 */
export function defaultPlan(change: Change): Operation[] {
  if (change.status === "remove") {
    return [{ action: "remove", id: change.id, kind: change.kind }];
  }

  if (change.resource.kind === "config") {
    return [];
  }

  if (change.resource.kind === "volume" && change.status === "modify") {
    return [];
  }

  if (change.resource.kind === "service" && change.status === "modify") {
    if (!change.previous)
      return [{ action: "recreate", resource: change.resource }];
    const changed = changedFields(change.previous, change.resource.config);
    if (!hasSpecChange(changed)) return [];
    return [{ action: "recreate", resource: change.resource }];
  }

  if (change.resource.kind === "cronjob" && change.status === "modify") {
    if (!change.previous)
      return [{ action: "recreate", resource: change.resource }];
    const changed = changedFields(change.previous, change.resource.config);
    if (!hasSpecChange(changed)) return [];
    return [{ action: "recreate", resource: change.resource }];
  }

  return [
    {
      action: change.status === "create" ? "create" : "update",
      resource: change.resource,
    },
  ];
}

/**
 * In-memory ExtendedRuntime for testing the full deploy pipeline
 * without external dependencies.
 */
export class SimulationRuntime implements ExtendedRuntime {
  /** Ordered log of executed operations. */
  log: LogEntry[] = [];
  /** Currently live resources. */
  resources = new Map<string, Resource>();
  /** Whether finalize() has been called. */
  finalized = false;
  /** Whether teardown() has been called. */
  tornDown = false;

  private planFn: (change: Change) => Operation[];
  private failures: Failure[] = [];
  private interceptor: ((op: Operation) => Promise<void>) | null = null;
  private opIndex = 0;

  constructor(planFn: (change: Change) => Operation[] = defaultPlan) {
    this.planFn = planFn;
  }

  plan(change: Change): Operation[] {
    return this.planFn(change);
  }

  async execute(op: Operation): Promise<void> {
    for (const failure of this.failures) {
      if (failure.fired) continue;
      if (failure.predicate(op)) {
        if (failure.once) failure.fired = true;
        throw failure.error;
      }
    }

    if (this.interceptor) {
      await this.interceptor(op);
    }

    this.log.push({ operation: op, index: this.opIndex++ });

    if (op.action === "remove") {
      this.resources.delete(op.id);
    } else {
      this.resources.set(op.resource.id, op.resource);
    }
  }

  async finalize(_currentServices: Service[]): Promise<void> {
    this.finalized = true;
  }

  async teardown(): Promise<void> {
    this.tornDown = true;
  }

  runtimeState(): Map<string, Record<string, unknown>> {
    const state = new Map<string, Record<string, unknown>>();
    for (const id of this.resources.keys()) {
      state.set(id, { simulated: true });
    }
    return state;
  }

  /** Next matching operation will throw. */
  failOn(predicate: OperationPredicate, error: Error, once = true): void {
    this.failures.push({ predicate, error, once, fired: false });
  }

  /** Global async hook called on every execute. */
  intercept(fn: (op: Operation) => Promise<void>): void {
    this.interceptor = fn;
  }

  /** Clear all state. */
  reset(): void {
    this.log = [];
    this.resources.clear();
    this.finalized = false;
    this.tornDown = false;
    this.failures = [];
    this.interceptor = null;
    this.opIndex = 0;
  }
}

/**
 * Full pipeline wrapper — drives deploy() with SimulationRuntime,
 * tracking state across deploys.
 */
export class Simulation {
  readonly runtime: SimulationRuntime;
  private _state: ResourceState[] = [];
  private _prevLogLength = 0;

  constructor(runtimeType?: RuntimeName) {
    if (!runtimeType) {
      this.runtime = new SimulationRuntime();
    } else if (runtimeType === "k8s") {
      const rt = createK8sRuntime({
        project: "test",
        secrets: new Map(),
        client: createMockK8sClient(),
      });
      this.runtime = new SimulationRuntime(rt.plan);
    } else {
      const factory =
        runtimeType === "swarm" ? createSwarmRuntime : createDockerRuntime;
      const rt = factory({
        project: "test",
        secrets: new Map(),
        client: createMockDockerClient(),
      });
      this.runtime = new SimulationRuntime(rt.plan);
    }
  }

  /** Current resource state (updated after each deploy). */
  get state(): ResourceState[] {
    return this._state;
  }

  /** Deploy a config, passing state from the previous deploy. */
  async deploy(config: unknown): Promise<ResourceState[]> {
    this._prevLogLength = this.runtime.log.length;
    const result = await deploy(config, this._state, this.runtime);
    this._state = result.state;
    return this._state;
  }

  /** Destroy all resources — deploy with empty config + teardown. */
  async destroy(): Promise<void> {
    this._prevLogLength = this.runtime.log.length;
    const result = await deploy({}, this._state, this.runtime);
    this._state = result.state;
    await this.runtime.teardown();
  }

  /** Operations from the most recent deploy only. */
  lastOps(): LogEntry[] {
    return this.runtime.log.slice(this._prevLogLength);
  }

  /** Start fresh. */
  reset(): void {
    this._state = [];
    this._prevLogLength = 0;
    this.runtime.reset();
  }
}
