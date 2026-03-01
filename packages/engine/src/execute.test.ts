import { deepStrictEqual, ok, rejects, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { Change, Operation, Runtime } from "@vyft/core";
import type { ExecuteEvent } from "./execute.ts";
import { execute } from "./execute.ts";
import { buildGraph } from "./graph.ts";
import { svc, vol } from "./helpers.test-utils.ts";

function mockRuntime(
  ops: Map<string, Operation[]> = new Map(),
): Runtime & { executed: Operation[] } {
  const executed: Operation[] = [];
  return {
    executed,
    plan(change: Change): Operation[] {
      if (change.status === "remove") {
        return [{ action: "remove", id: change.id, kind: change.kind }];
      }
      return (
        ops.get(change.resource.id) ?? [
          {
            action: change.status === "create" ? "create" : "update",
            resource: change.resource,
          },
        ]
      );
    },
    async execute(op: Operation) {
      executed.push(op);
    },
  };
}

describe("execute", () => {
  it("returns empty for no changes", async () => {
    const rt = mockRuntime();
    const result = await execute([], rt);
    deepStrictEqual(result, []);
    deepStrictEqual(rt.executed, []);
  });

  it("translates changes to operations and executes them", async () => {
    const v = vol("data");
    const rt = mockRuntime();
    const ops = await execute([{ status: "create", resource: v }], rt);
    strictEqual(ops.length, 1);
    deepStrictEqual(ops[0], { action: "create", resource: v });
    deepStrictEqual(rt.executed, ops);
  });

  it("handles remove changes", async () => {
    const rt = mockRuntime();
    const ops = await execute(
      [{ status: "remove", id: "old", kind: "volume" }],
      rt,
    );
    deepStrictEqual(ops, [{ action: "remove", id: "old", kind: "volume" }]);
  });

  it("executes all operations (sequential fallback without graph)", async () => {
    const a = vol("a");
    const b = svc("b");
    const rt = mockRuntime();
    await execute(
      [
        { status: "create", resource: a },
        { status: "create", resource: b },
      ],
      rt,
    );
    strictEqual(rt.executed.length, 2);
    strictEqual(rt.executed[0]?.action, "create");
    strictEqual(rt.executed[1]?.action, "create");
  });

  it("handles runtime returning zero operations for a change", async () => {
    const v = vol("data");
    const rt = mockRuntime(new Map([["data", []]]));
    const ops = await execute([{ status: "create", resource: v }], rt);
    deepStrictEqual(ops, []);
    deepStrictEqual(rt.executed, []);
  });

  it("supports runtime returning multiple operations per change", async () => {
    const api = svc("api");
    const rt = mockRuntime(
      new Map([
        [
          "api",
          [
            { action: "remove" as const, id: "api", kind: "service" as const },
            { action: "create" as const, resource: api },
          ],
        ],
      ]),
    );
    const ops = await execute([{ status: "modify", resource: api }], rt);
    strictEqual(ops.length, 2);
    strictEqual(ops[0]?.action, "remove");
    strictEqual(ops[1]?.action, "create");
  });

  it("executes independent operations concurrently within a level", async () => {
    const a = vol("a");
    const b = vol("b");
    const graph = buildGraph([a, b]);

    const events: string[] = [];
    const rt: Runtime = {
      plan(change: Change): Operation[] {
        if (change.status === "remove") {
          return [{ action: "remove", id: change.id, kind: change.kind }];
        }
        return [{ action: "create", resource: change.resource }];
      },
      async execute(op: Operation) {
        const id = op.action === "remove" ? op.id : op.resource.id;
        events.push(`start:${id}`);
        await new Promise((r) => setTimeout(r, 20));
        events.push(`end:${id}`);
      },
    };

    await execute(
      [
        { status: "create", resource: a },
        { status: "create", resource: b },
      ],
      rt,
      graph,
    );

    strictEqual(events[0], "start:a");
    strictEqual(events[1], "start:b");
  });

  it("waits for dependencies before starting dependents", async () => {
    const v = vol("data");
    const s = svc("api", {
      image: "test",
      mounts: [{ volume: v, path: "/data" }],
    });
    const graph = buildGraph([v, s]);

    const events: string[] = [];
    const rt: Runtime = {
      plan(change: Change): Operation[] {
        if (change.status === "remove") {
          return [{ action: "remove", id: change.id, kind: change.kind }];
        }
        return [{ action: "create", resource: change.resource }];
      },
      async execute(op: Operation) {
        const id = op.action === "remove" ? op.id : op.resource.id;
        events.push(`start:${id}`);
        await new Promise((r) => setTimeout(r, 20));
        events.push(`end:${id}`);
      },
    };

    await execute(
      [
        { status: "create", resource: v },
        { status: "create", resource: s },
      ],
      rt,
      graph,
    );

    ok(
      events.indexOf("end:data") < events.indexOf("start:api"),
      `expected volume to finish before service starts, got: ${events.join(", ")}`,
    );
  });

  it("parallelizes independent services while respecting shared deps", async () => {
    const v = vol("data");
    const s1 = svc("s1", {
      image: "test",
      mounts: [{ volume: v, path: "/d" }],
    });
    const s2 = svc("s2", {
      image: "test",
      mounts: [{ volume: v, path: "/d" }],
    });
    const graph = buildGraph([v, s1, s2]);

    const events: string[] = [];
    const rt: Runtime = {
      plan(change: Change): Operation[] {
        if (change.status === "remove") {
          return [{ action: "remove", id: change.id, kind: change.kind }];
        }
        return [{ action: "create", resource: change.resource }];
      },
      async execute(op: Operation) {
        const id = op.action === "remove" ? op.id : op.resource.id;
        events.push(`start:${id}`);
        await new Promise((r) => setTimeout(r, 20));
        events.push(`end:${id}`);
      },
    };

    await execute(
      [
        { status: "create", resource: v },
        { status: "create", resource: s1 },
        { status: "create", resource: s2 },
      ],
      rt,
      graph,
    );

    ok(events.indexOf("end:data") < events.indexOf("start:s1"));
    ok(events.indexOf("end:data") < events.indexOf("start:s2"));

    const s1Start = events.indexOf("start:s1");
    const s2Start = events.indexOf("start:s2");
    const s1End = events.indexOf("end:s1");
    const s2End = events.indexOf("end:s2");
    ok(s1Start < s1End && s2Start < s2End);
    ok(s1Start < s2End && s2Start < s1End, "services should overlap");
  });

  it("handles recreate (multi-op) sequentially per resource but parallel across resources", async () => {
    const a = svc("a");
    const b = svc("b");
    const graph = buildGraph([a, b]);

    const events: string[] = [];
    const rt: Runtime = {
      plan(change: Change): Operation[] {
        if (change.status === "remove") {
          return [{ action: "remove", id: change.id, kind: change.kind }];
        }
        return [
          {
            action: "remove",
            id: change.resource.id,
            kind: change.resource.kind,
          },
          { action: "create", resource: change.resource },
        ];
      },
      async execute(op: Operation) {
        const id = op.action === "remove" ? op.id : op.resource.id;
        events.push(`${op.action}:${id}`);
        await new Promise((r) => setTimeout(r, 20));
      },
    };

    await execute(
      [
        { status: "modify", resource: a },
        { status: "modify", resource: b },
      ],
      rt,
      graph,
    );

    ok(events.indexOf("remove:a") < events.indexOf("create:a"));
    ok(events.indexOf("remove:b") < events.indexOf("create:b"));
  });

  it("calls hook with before/after events for create", async () => {
    const v = vol("data");
    const rt = mockRuntime();
    const hookEvents: ExecuteEvent[] = [];

    await execute(
      [{ status: "create", resource: v }],
      rt,
      undefined,
      async (event) => {
        hookEvents.push(event);
      },
    );

    deepStrictEqual(hookEvents, [
      { phase: "before", id: "data", operation: "creating" },
      { phase: "after", id: "data" },
    ]);
  });

  it("calls hook with before/after events for modify", async () => {
    const v = vol("data");
    const rt = mockRuntime();
    const hookEvents: ExecuteEvent[] = [];

    await execute(
      [{ status: "modify", resource: v }],
      rt,
      undefined,
      async (event) => {
        hookEvents.push(event);
      },
    );

    deepStrictEqual(hookEvents, [
      { phase: "before", id: "data", operation: "updating" },
      { phase: "after", id: "data" },
    ]);
  });

  it("emits before/removed for remove operations", async () => {
    const rt = mockRuntime();
    const hookEvents: ExecuteEvent[] = [];

    await execute(
      [{ status: "remove", id: "old", kind: "volume" }],
      rt,
      undefined,
      async (event) => {
        hookEvents.push(event);
      },
    );

    deepStrictEqual(hookEvents, [
      { phase: "before", id: "old", operation: "deleting" },
      { phase: "removed", id: "old" },
    ]);
  });

  it("does not emit after when runtime throws", async () => {
    const v = vol("data");
    const hookEvents: ExecuteEvent[] = [];
    const rt: Runtime = {
      plan(change: Change): Operation[] {
        if (change.status === "remove") {
          return [{ action: "remove", id: change.id, kind: change.kind }];
        }
        return [{ action: "create", resource: change.resource }];
      },
      async execute() {
        throw new Error("boom");
      },
    };

    await rejects(
      execute(
        [{ status: "create", resource: v }],
        rt,
        undefined,
        async (event) => {
          hookEvents.push(event);
        },
      ),
      /boom/,
    );

    strictEqual(hookEvents.length, 1);
    deepStrictEqual(hookEvents[0], {
      phase: "before",
      id: "data",
      operation: "creating",
    });
  });

  it("emits events with graph-based parallel execution", async () => {
    const a = vol("a");
    const b = vol("b");
    const graph = buildGraph([a, b]);
    const rt = mockRuntime();
    const hookEvents: ExecuteEvent[] = [];

    await execute(
      [
        { status: "create", resource: a },
        { status: "create", resource: b },
      ],
      rt,
      graph,
      async (event) => {
        hookEvents.push(event);
      },
    );

    const beforeA = hookEvents.find(
      (e) => e.phase === "before" && e.id === "a",
    );
    const afterA = hookEvents.find((e) => e.phase === "after" && e.id === "a");
    const beforeB = hookEvents.find(
      (e) => e.phase === "before" && e.id === "b",
    );
    const afterB = hookEvents.find((e) => e.phase === "after" && e.id === "b");

    ok(beforeA, "should have before event for a");
    ok(afterA, "should have after event for a");
    ok(beforeB, "should have before event for b");
    ok(afterB, "should have after event for b");

    ok(hookEvents.indexOf(beforeA) < hookEvents.indexOf(afterA));
    ok(hookEvents.indexOf(beforeB) < hookEvents.indexOf(afterB));
  });

  it("emits events for removes in graph path", async () => {
    const v = vol("data");
    const graph = buildGraph([v]);
    const rt = mockRuntime();
    const hookEvents: ExecuteEvent[] = [];

    await execute(
      [
        { status: "create", resource: v },
        { status: "remove", id: "old", kind: "volume" },
      ],
      rt,
      graph,
      async (event) => {
        hookEvents.push(event);
      },
    );

    const beforeCreate = hookEvents.find(
      (e) => e.phase === "before" && e.id === "data",
    );
    const afterCreate = hookEvents.find(
      (e) => e.phase === "after" && e.id === "data",
    );
    const beforeRemove = hookEvents.find(
      (e) => e.phase === "before" && e.id === "old",
    );
    const removedEvent = hookEvents.find(
      (e) => e.phase === "removed" && e.id === "old",
    );

    ok(beforeCreate);
    ok(afterCreate);
    ok(beforeRemove);
    ok(removedEvent);
  });

  it("works without hook (existing behavior unchanged)", async () => {
    const v = vol("data");
    const rt = mockRuntime();
    const ops = await execute([{ status: "create", resource: v }], rt);
    strictEqual(ops.length, 1);
    deepStrictEqual(ops[0], { action: "create", resource: v });
    deepStrictEqual(rt.executed, ops);
  });
});
