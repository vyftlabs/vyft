import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { Change, Operation, ResourceState, Runtime } from "@vyft/core";
import { sec, svc, vol } from "./helpers.test-utils.ts";
import type { StateEvent } from "./index.ts";
import { deploy } from "./index.ts";

function mockRuntime(): Runtime & { operations: Operation[] } {
  const operations: Operation[] = [];
  return {
    operations,
    plan(change: Change): Operation[] {
      if (change.status === "remove") {
        return [{ action: "remove", id: change.id, kind: change.kind }];
      }
      return [
        {
          action: change.status === "create" ? "create" : "update",
          resource: change.resource,
        },
      ];
    },
    async execute(op: Operation) {
      operations.push(op);
    },
  };
}

describe("deploy", () => {
  it("creates all resources on first deploy", async () => {
    const v = vol("data");
    const s = sec("pass");
    const api = svc("api", {
      image: "node",
      mounts: [{ source: v, path: "/data" }],
      env: { SECRET: s },
    });
    const rt = mockRuntime();
    const result = await deploy({ v, s, api }, [], rt);

    strictEqual(rt.operations.length, 3);
    ok(rt.operations.every((op) => op.action === "create"));
    strictEqual(result.state.length, 3);

    for (const entry of result.state) {
      ok(typeof entry.id === "string");
      ok(typeof entry.kind === "string");
      ok(typeof entry.fingerprint === "string");
      ok(typeof entry.inputs === "object");
      ok(typeof entry.outputs === "object");
      ok(Array.isArray(entry.dependencies));
      ok(typeof entry.runtime === "object");
      ok(typeof entry.created === "string");
      ok(typeof entry.modified === "string");
      strictEqual(entry.taint, false);
    }
  });

  it("produces no operations when state matches", async () => {
    const v = vol("data");
    const rt = mockRuntime();
    const first = await deploy({ v }, [], rt);

    rt.operations.length = 0;
    await deploy({ v }, first.state, rt);
    strictEqual(rt.operations.length, 0);
  });

  it("detects changes between deploys", async () => {
    const v = vol("data");
    const rt = mockRuntime();
    const first = await deploy({ v }, [], rt);

    rt.operations.length = 0;
    const v2 = {
      kind: "volume" as const,
      id: "data",
      config: { size: "10Gi" },
    };
    const second = await deploy({ v: v2 }, first.state, rt);

    strictEqual(rt.operations.length, 1);
    strictEqual(rt.operations[0]?.action, "update");
    strictEqual(second.state.length, 1);
  });

  it("handles empty config", async () => {
    const rt = mockRuntime();
    const result = await deploy({}, [], rt);
    strictEqual(rt.operations.length, 0);
    strictEqual(result.state.length, 0);
  });

  it("detects removals", async () => {
    const v = vol("data");
    const s = sec("pass");
    const rt = mockRuntime();
    const first = await deploy({ v, s }, [], rt);

    rt.operations.length = 0;
    await deploy({ v }, first.state, rt);
    ok(rt.operations.some((op) => op.action === "remove"));
  });

  it("preserves created timestamp on subsequent deploy", async () => {
    const v = vol("data");
    const rt = mockRuntime();
    const first = await deploy({ v }, [], rt);
    const created = first.state[0]?.created;

    rt.operations.length = 0;
    const v2 = {
      kind: "volume" as const,
      id: "data",
      config: { size: "10Gi" },
    };
    const second = await deploy({ v: v2 }, first.state, rt);

    ok(created, "created timestamp should be defined");
    strictEqual(second.state[0]?.created, created);
    const modified = second.state[0]?.modified;
    ok(modified, "modified timestamp should be defined");
    ok(modified >= created);
  });

  it("includes service outputs", async () => {
    const api = svc("api", { image: "node" });
    const rt = mockRuntime();
    const result = await deploy({ api }, [], rt);
    const entry = result.state[0];
    ok(entry, "should have a state entry");

    deepStrictEqual(entry.outputs, {
      host: "api",
      port: 3000,
      url: "http://api:3000",
    });
  });

  it("includes dependencies", async () => {
    const v = vol("data");
    const api = svc("api", {
      image: "node",
      mounts: [{ source: v, path: "/data" }],
    });
    const rt = mockRuntime();
    const result = await deploy({ v, api }, [], rt);

    const apiEntry = result.state.find((e) => e.id === "api");
    ok(apiEntry, "api entry should exist");
    ok(apiEntry.dependencies.includes("data"));
  });

  it("preserves runtime from previous state", async () => {
    const v = vol("data");
    const rt = mockRuntime();

    const prev: ResourceState[] = [
      {
        id: "data",
        kind: "volume",
        fingerprint: "",
        inputs: {},
        outputs: {},
        dependencies: [],
        runtime: { containerId: "abc123" },
        created: "2025-01-01T00:00:00.000Z",
        modified: "2025-01-01T00:00:00.000Z",
        taint: false,
      },
    ];

    const result = await deploy({ v }, prev, rt);
    deepStrictEqual(result.state[0]?.runtime, { containerId: "abc123" });
  });

  it("calls onState with pending then committed for creates", async () => {
    const v = vol("data");
    const rt = mockRuntime();
    const events: StateEvent[] = [];

    await deploy({ v }, [], rt, async (event) => {
      events.push(event);
    });

    strictEqual(events.length, 2);
    deepStrictEqual(events[0], {
      type: "pending",
      id: "data",
      operation: "creating",
    });
    strictEqual(events[1]?.type, "committed");
    if (events[1]?.type === "committed") {
      strictEqual(events[1]?.id, "data");
      ok(events[1]?.state);
      strictEqual(events[1]?.state.kind, "volume");
      ok(typeof events[1]?.state.fingerprint === "string");
      ok(typeof events[1]?.state.created === "string");
    }
  });

  it("calls onState with removed for removals", async () => {
    const v = vol("data");
    const s = sec("pass");
    const rt = mockRuntime();
    const first = await deploy({ v, s }, [], rt);

    rt.operations.length = 0;
    const events: StateEvent[] = [];
    await deploy({ v }, first.state, rt, async (event) => {
      events.push(event);
    });

    const pendingRemove = events.find(
      (e) =>
        e.type === "pending" && e.id === "pass" && e.operation === "deleting",
    );
    const removed = events.find((e) => e.type === "removed" && e.id === "pass");
    ok(pendingRemove, "should have pending delete event");
    ok(removed, "should have removed event");
  });

  it("emits committed with valid ResourceState shape", async () => {
    const api = svc("api", { image: "node" });
    const rt = mockRuntime();
    const events: StateEvent[] = [];

    await deploy({ api }, [], rt, async (event) => {
      events.push(event);
    });

    const committed = events.find((e) => e.type === "committed");
    ok(committed);
    if (committed.type === "committed") {
      strictEqual(committed.state.id, "api");
      strictEqual(committed.state.kind, "service");
      deepStrictEqual(committed.state.outputs, {
        host: "api",
        port: 3000,
        url: "http://api:3000",
      });
      strictEqual(committed.state.taint, false);
      ok(Array.isArray(committed.state.dependencies));
    }
  });

  it("works without onState hook (existing behavior)", async () => {
    const v = vol("data");
    const rt = mockRuntime();
    const result = await deploy({ v }, [], rt);
    strictEqual(result.state.length, 1);
    strictEqual(result.state[0]?.id, "data");
  });
});
