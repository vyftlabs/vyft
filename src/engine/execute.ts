import * as log from "../logger.ts";
import type { HealthCheck } from "../resource.ts";
import { durationToMs } from "../runtimes/duration.ts";
import type { Operation, Runtime } from "../runtimes/types.ts";
import type { Graph } from "./graph.ts";
import { order } from "./order.ts";
import type { Change } from "./plan.ts";

export type ExecuteEvent =
  | {
      phase: "before";
      id: string;
      operation: "creating" | "updating" | "deleting";
    }
  | { phase: "after"; id: string }
  | { phase: "removed"; id: string };

export type ExecuteHook = (event: ExecuteEvent) => Promise<void>;

function opId(op: Operation): string {
  return op.action === "remove" ? op.id : op.resource.id;
}

function pendingType(
  status: Change["status"],
): "creating" | "updating" | "deleting" {
  switch (status) {
    case "create":
      return "creating";
    case "modify":
      return "updating";
    case "remove":
      return "deleting";
  }
}

/**
 * Translate changes into runtime operations and execute them.
 * When a dependency graph is provided, independent operations within the same
 * level run concurrently via Promise.all. Operations for the same resource
 * (e.g. recreate = remove + create) stay sequential.
 *
 * When `onEvent` is provided, lifecycle events are emitted around each
 * resource's operations. If `runtime.execute()` throws, the `after`/`removed`
 * event is never fired — leaving a pending entry in state for crash recovery.
 */
export async function execute(
  changes: Change[],
  runtime: Runtime,
  graph?: Graph,
  onEvent?: ExecuteHook,
): Promise<Operation[]> {
  // Plan all operations, grouping by originating change
  const operations: Operation[] = [];
  const opsForResource = new Map<string, Operation[]>();
  const removeOps: Operation[] = [];
  const changeForId = new Map<string, Change["status"]>();

  for (const change of changes) {
    const ops = runtime.plan(change);
    operations.push(...ops);

    const id = change.status === "remove" ? change.id : change.resource.id;
    changeForId.set(id, change.status);

    if (!graph) continue;

    if (change.status === "remove") {
      removeOps.push(...ops);
    } else {
      let list = opsForResource.get(id);
      if (!list) {
        list = [];
        opsForResource.set(id, list);
      }
      list.push(...ops);
    }
  }

  if (!graph || operations.length <= 1) {
    // Group consecutive ops by resource for lifecycle events
    const groups: { id: string; ops: Operation[] }[] = [];
    for (const op of operations) {
      const id = opId(op);
      const last = groups[groups.length - 1];
      if (last && last.id === id) {
        last.ops.push(op);
      } else {
        groups.push({ id, ops: [op] });
      }
    }

    for (const { id, ops } of groups) {
      const status = changeForId.get(id);
      if (!status)
        throw new Error(`No change status found for resource "${id}"`);
      if (onEvent)
        await onEvent({ phase: "before", id, operation: pendingType(status) });
      for (const op of ops) {
        log.step(op.action, id);
        await runtime.execute(op);
      }
      if (onEvent) {
        await onEvent(
          status === "remove"
            ? { phase: "removed", id }
            : { phase: "after", id },
        );
      }
    }

    return operations;
  }

  // DAG-aware execution — each resource starts as soon as its dependencies resolve
  const allResources = order(graph);
  const completed = new Map<string, Promise<void>>();
  let failed: Error | null = null;

  for (const resource of allResources) {
    const ops = opsForResource.get(resource.id);
    if (!ops?.length) {
      completed.set(resource.id, Promise.resolve());
      continue;
    }

    const deps = graph.dependencies.get(resource.id) ?? new Set<string>();
    const depPromises = [...deps]
      .map((d) => completed.get(d))
      .filter((p): p is Promise<void> => p !== undefined);

    const work = Promise.all(depPromises).then(async () => {
      if (failed) return;
      try {
        if (onEvent) {
          await onEvent({
            phase: "before",
            id: resource.id,
            operation: pendingType(changeForId.get(resource.id) ?? "create"),
          });
        }
        for (const op of ops) {
          log.step(op.action, opId(op));
          await runtime.execute(op);
        }
        // Health-check waiting for services
        if (
          runtime.waitForHealthy &&
          resource.kind === "service" &&
          resource.config.health
        ) {
          await runtime.waitForHealthy(
            resource.id,
            computeHealthTimeout(resource.config.health),
          );
        }
        if (onEvent) await onEvent({ phase: "after", id: resource.id });
      } catch (err) {
        failed = err as Error;
        throw err;
      }
    });

    completed.set(resource.id, work);
  }

  // Wait for all create/update work to settle
  const results = await Promise.allSettled(completed.values());
  const firstError = results.find(
    (r): r is PromiseRejectedResult => r.status === "rejected",
  );

  // Removes run sequentially — removed resources aren't in the current graph
  const removeGroups: { id: string; ops: Operation[] }[] = [];
  for (const op of removeOps) {
    const id = opId(op);
    const last = removeGroups[removeGroups.length - 1];
    if (last && last.id === id) {
      last.ops.push(op);
    } else {
      removeGroups.push({ id, ops: [op] });
    }
  }

  for (const { id, ops } of removeGroups) {
    if (onEvent) await onEvent({ phase: "before", id, operation: "deleting" });
    for (const op of ops) {
      log.step(op.action, id);
      await runtime.execute(op);
    }
    if (onEvent) await onEvent({ phase: "removed", id });
  }

  if (firstError) throw firstError.reason;
  return operations;
}

function computeHealthTimeout(health: HealthCheck): number {
  const startPeriod = health.startPeriod ? durationToMs(health.startPeriod) : 0;
  const interval = health.interval ? durationToMs(health.interval) : 30_000;
  const retries = health.retries ?? 3;
  return startPeriod + interval * retries * 2; // 2x safety margin
}
