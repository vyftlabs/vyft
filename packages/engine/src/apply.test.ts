import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { URN } from "@vyft/primitives";
import { buildURN } from "@vyft/primitives";
import type { ResourceState, State, WALEntry } from "@vyft/store";
import type { Dispatcher, Resolve } from "./apply.ts";
import { apply } from "./apply.ts";
import type { LifecycleOp } from "./transform.ts";

const noResolve: Resolve = (urn, key) => {
  throw new Error(`Unexpected resolve call: ${urn} ${key}`);
};

function trackingDispatcher(): Dispatcher & { calls: LifecycleOp[] } {
  const calls: LifecycleOp[] = [];
  const fn = async (op: LifecycleOp) => {
    calls.push(op);
    return { outputs: { dispatched: true } };
  };
  fn.calls = calls;
  return fn as Dispatcher & { calls: LifecycleOp[] };
}

function applyEntry(state: State, entry: WALEntry): State {
  if (entry.type === "committed") {
    const prev = state.get(entry.urn);
    const rs: ResourceState = {
      urn: entry.urn,
      fingerprint: entry.fingerprint,
      inputs: entry.inputs,
      outputs: entry.outputs,
      dependencies: prev?.dependencies ?? [],
      created: prev?.created ?? new Date().toISOString(),
      modified: new Date().toISOString(),
      taint: false,
    };
    const next = new Map(state);
    next.set(entry.urn, rs);
    return next;
  }
  if (entry.type === "removed") {
    const next = new Map(state);
    next.delete(entry.urn);
    return next;
  }
  return state;
}

describe("apply", () => {
  it("yields pending then committed for create", async () => {
    const urn = buildURN("platform", "default", "volume", "data");
    const dispatcher = trackingDispatcher();
    const op: LifecycleOp = { action: "create", urn, input: { size: "10Gi" } };

    const entries: WALEntry[] = [];
    for await (const entry of apply(op, dispatcher, noResolve)) {
      entries.push(entry);
    }

    strictEqual(entries.length, 2);
    strictEqual(entries[0]?.type, "pending");
    if (entries[0]?.type === "pending") {
      strictEqual(entries[0].action, "creating");
    }
    strictEqual(entries[1]?.type, "committed");
    if (entries[1]?.type === "committed") {
      deepStrictEqual(entries[1].inputs, { size: "10Gi" });
      deepStrictEqual(entries[1].outputs, { dispatched: true });
      ok(entries[1].fingerprint);
    }
  });

  it("yields pending then removed for delete", async () => {
    const urn = buildURN("platform", "default", "volume", "data");
    const dispatcher = trackingDispatcher();
    const op: LifecycleOp = { action: "delete", urn };

    const entries: WALEntry[] = [];
    for await (const entry of apply(op, dispatcher, noResolve)) {
      entries.push(entry);
    }

    strictEqual(entries.length, 2);
    strictEqual(entries[0]?.type, "pending");
    if (entries[0]?.type === "pending") {
      strictEqual(entries[0].action, "deleting");
    }
    strictEqual(entries[1]?.type, "removed");
  });

  it("calls dispatcher", async () => {
    const urn = buildURN("platform", "default", "volume", "data");
    const dispatcher = trackingDispatcher();
    const op: LifecycleOp = { action: "create", urn, input: {} };

    for await (const _ of apply(op, dispatcher, noResolve)) {
      // consume
    }

    strictEqual(dispatcher.calls.length, 1);
    strictEqual(dispatcher.calls[0]?.action, "create");
  });

  it("executes levels sequentially", async () => {
    const urn1 = buildURN("platform", "default", "volume", "data");
    const urn2 = buildURN("runtime", "docker", "service", "api");
    const order: string[] = [];

    const dispatcher: Dispatcher = async (op) => {
      order.push(op.urn);
      return { outputs: {} };
    };

    const ops: LifecycleOp[][] = [
      [{ action: "create", urn: urn1, input: {} }],
      [{ action: "create", urn: urn2, input: {} }],
    ];

    let state: State = new Map();
    for (const level of ops) {
      await Promise.all(
        level.map(async (op) => {
          for await (const entry of apply(op, dispatcher, noResolve)) {
            state = applyEntry(state, entry);
          }
        }),
      );
    }

    deepStrictEqual(order, [urn1, urn2]);
  });

  it("executes ops within a level concurrently", async () => {
    const urn1 = buildURN("platform", "default", "volume", "a");
    const urn2 = buildURN("platform", "default", "volume", "b");
    const concurrent: string[] = [];

    const dispatcher: Dispatcher = async (op) => {
      concurrent.push(`start:${op.urn}`);
      await new Promise((r) => setTimeout(r, 10));
      concurrent.push(`end:${op.urn}`);
      return { outputs: {} };
    };

    const ops: LifecycleOp[][] = [
      [
        { action: "create", urn: urn1, input: {} },
        { action: "create", urn: urn2, input: {} },
      ],
    ];

    let state: State = new Map();
    for (const level of ops) {
      await Promise.all(
        level.map(async (op) => {
          for await (const entry of apply(op, dispatcher, noResolve)) {
            state = applyEntry(state, entry);
          }
        }),
      );
    }

    // Both should start before either ends (concurrent)
    const firstEnd = concurrent.findIndex((e) => e.startsWith("end:"));
    const starts = concurrent
      .slice(0, firstEnd)
      .filter((e) => e.startsWith("start:"));
    strictEqual(starts.length, 2);
  });

  it("handles mixed operations across levels", async () => {
    const volUrn = buildURN("platform", "default", "volume", "data");
    const svcUrn = buildURN("runtime", "docker", "service", "old");
    const newUrn = buildURN("runtime", "docker", "service", "new");

    const dispatcher = trackingDispatcher();

    const ops: LifecycleOp[][] = [
      [{ action: "delete", urn: svcUrn }],
      [
        { action: "update", urn: volUrn, input: { size: "20Gi" } },
        { action: "create", urn: newUrn, input: { image: "node" } },
      ],
    ];

    // Seed initial state
    let state: State = new Map();
    state.set(volUrn, {
      urn: volUrn,
      fingerprint: "test",
      inputs: {},
      outputs: {},
      dependencies: [],
      created: "2025-01-01T00:00:00.000Z",
      modified: "2025-01-01T00:00:00.000Z",
      taint: false,
    });
    state.set(svcUrn, {
      urn: svcUrn,
      fingerprint: "test",
      inputs: {},
      outputs: {},
      dependencies: [],
      created: "2025-01-01T00:00:00.000Z",
      modified: "2025-01-01T00:00:00.000Z",
      taint: false,
    });

    for (const level of ops) {
      await Promise.all(
        level.map(async (op) => {
          for await (const entry of apply(op, dispatcher, noResolve)) {
            state = applyEntry(state, entry);
          }
        }),
      );
    }

    strictEqual(state.size, 2);
    ok(state.has(volUrn));
    ok(state.has(newUrn));
    ok(!state.has(svcUrn));
  });

  it("resolves env variable references before dispatching", async () => {
    const varUrn = buildURN("platform", "default", "variable", "db-pass");
    const svcUrn = buildURN("runtime", "docker", "service", "api");

    let dispatchedInput: unknown;
    const dispatcher: Dispatcher = async (op) => {
      if (op.action !== "delete") dispatchedInput = op.input;
      return { outputs: {} };
    };

    const resolve = (urn: URN, key: string) => {
      if (urn === varUrn && key === "value") return "hunter2";
      throw new Error(`Unknown: ${urn} ${key}`);
    };

    const op: LifecycleOp = {
      action: "create",
      urn: svcUrn,
      input: {
        image: "node:20",
        env: { DB_PASS: { kind: "variable", id: "db-pass" } },
      },
    };

    for await (const _ of apply(op, dispatcher, resolve)) {
      // consume
    }

    const input = dispatchedInput as Record<string, unknown>;
    deepStrictEqual(input["env"], { DB_PASS: "hunter2" });
    strictEqual(input["image"], "node:20");
  });
});
