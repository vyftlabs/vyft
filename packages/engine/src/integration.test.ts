import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { parseURN, type URN } from "@vyft/primitives";
import type { ResourceState, State, WALEntry } from "@vyft/store";
import type { Dispatcher, Resolve } from "./apply.ts";
import { apply } from "./apply.ts";
import { cron, sec, svc, vol } from "./helpers.test-utils.ts";
import { fingerprint } from "./plan.ts";
import type { LifecycleOp } from "./transform.ts";
import { hydrate, transform } from "./transform.ts";

/**
 * Integration tests — full transform → build → apply pipeline.
 */

/** Dispatcher that records calls and returns outputs keyed by resource id. */
function mockDispatcher(
  outputMap: Record<string, Record<string, unknown>> = {},
): Dispatcher & { calls: LifecycleOp[] } {
  const calls: LifecycleOp[] = [];
  const fn = async (op: LifecycleOp) => {
    calls.push(op);
    const id = parseURN(op.urn).id;
    return { outputs: outputMap[id] ?? {} };
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

/** Lookup a resource in final state by id. */
function findByID(state: State, id: string): ResourceState {
  for (const rs of state.values()) {
    if (parseURN(rs.urn).id === id) return rs;
  }
  throw new Error(`resource "${id}" not found in state`);
}

/** Run all ops against state using apply, mutating stateRef. */
async function run(
  ops: LifecycleOp[][],
  stateRef: { current: State },
  dispatcher: Dispatcher,
  resolve: Resolve,
  onEntry?: (entry: WALEntry) => void,
): Promise<void> {
  for (const level of ops) {
    await Promise.all(
      level.map(async (op) => {
        for await (const entry of apply(op, dispatcher, resolve)) {
          stateRef.current = applyEntry(stateRef.current, entry);
          onEntry?.(entry);
        }
      }),
    );
  }
}

function setup(dispatcher?: Dispatcher & { calls: LifecycleOp[] }) {
  const stateRef = { current: new Map() as State };
  const d = dispatcher ?? mockDispatcher();
  const resolve: Resolve = (urn, key) => {
    const rs = stateRef.current.get(urn);
    if (!rs) throw new Error(`Resource ${urn} not found`);
    return rs.outputs[key];
  };
  return { stateRef, dispatcher: d, resolve };
}

describe("integration: transform → build → apply", () => {
  it("creates resources from empty state", async () => {
    const v = vol("data");
    const s = svc("api", { image: "node:20" });

    const ops = transform(new Map()).add(v).add(s).build();

    const d = mockDispatcher({
      data: { created: true },
      api: { host: "api", port: 3000, url: "http://api:3000" },
    });
    const { stateRef, resolve } = setup(d);

    await run(ops, stateRef, d, resolve);

    strictEqual(stateRef.current.size, 2);
    deepStrictEqual(findByID(stateRef.current, "data").outputs, {
      created: true,
    });
    deepStrictEqual(findByID(stateRef.current, "api").outputs, {
      host: "api",
      port: 3000,
      url: "http://api:3000",
    });
    strictEqual(d.calls.length, 2);
    ok(d.calls.every((c) => c.action === "create"));
  });

  it("removes resources from existing state", async () => {
    const v = vol("data");
    const s = svc("api", { image: "node:20" });

    const createOps = transform(new Map()).add(v).add(s).build();
    const { stateRef, dispatcher, resolve } = setup();

    await run(createOps, stateRef, dispatcher, resolve);
    strictEqual(stateRef.current.size, 2);

    const removeOps = transform(stateRef.current)
      .remove(v.urn as URN)
      .build();
    await run(removeOps, stateRef, dispatcher, resolve);

    strictEqual(stateRef.current.size, 1);
    const entry = [...stateRef.current.values()][0];
    ok(entry);
    strictEqual(parseURN(entry.urn).id, "api");
  });

  it("updates resources with changed config", async () => {
    const v = vol("data");
    const createOps = transform(new Map()).add(v).build();
    const { stateRef, dispatcher, resolve } = setup();

    await run(createOps, stateRef, dispatcher, resolve);

    const vUrn = v.urn as URN;
    const updateOps = transform(stateRef.current)
      .update(vUrn, () => ({ size: "50Gi" }))
      .build();

    ok(updateOps.length > 0, "should produce update ops");
    ok(
      updateOps.flat().some((op) => op.action === "update" && op.urn === vUrn),
    );

    const created = stateRef.current.get(vUrn)?.created;
    await run(updateOps, stateRef, dispatcher, resolve);

    strictEqual(stateRef.current.size, 1);
    deepStrictEqual(findByID(stateRef.current, "data").inputs, {
      size: "50Gi",
    });
    strictEqual(stateRef.current.get(vUrn)?.created, created);
  });

  it("mixed add, update, and remove in one pass", async () => {
    const v = vol("data");
    const api = svc("api", { image: "node:18" });
    const worker = svc("worker", { image: "worker:1" });

    const createOps = transform(new Map()).add(v).add(api).add(worker).build();
    const { stateRef, dispatcher, resolve } = setup();

    await run(createOps, stateRef, dispatcher, resolve);
    strictEqual(stateRef.current.size, 3);

    const cache = svc("cache", { image: "redis:7" });
    const ops = transform(stateRef.current)
      .update(api.urn as URN, () => ({ image: "node:20", port: 8080 }))
      .remove(worker.urn as URN)
      .add(cache)
      .build();

    await run(ops, stateRef, dispatcher, resolve);

    strictEqual(stateRef.current.size, 3);
    const ids = [...stateRef.current.values()].map((r) => parseURN(r.urn).id);
    ok(ids.includes("data"));
    ok(ids.includes("api"));
    ok(ids.includes("cache"));
    ok(!ids.includes("worker"));

    deepStrictEqual(findByID(stateRef.current, "api").inputs, {
      image: "node:20",
      port: 8080,
    });
  });

  it("taint forces update even without config change", async () => {
    const v = vol("data");
    const createOps = transform(new Map()).add(v).build();
    const { stateRef, dispatcher, resolve } = setup();

    await run(createOps, stateRef, dispatcher, resolve);

    const vUrn = v.urn as URN;
    const fpBefore = stateRef.current.get(vUrn)?.fingerprint;

    const taintOps = transform(stateRef.current).taint(vUrn).build();
    ok(taintOps.length > 0, "taint should produce ops");
    const taintOp = taintOps.flat().find((op) => op.urn === vUrn);
    ok(taintOp);
    strictEqual(taintOp.action, "update");

    await run(taintOps, stateRef, dispatcher, resolve);

    strictEqual(stateRef.current.size, 1);
    strictEqual(findByID(stateRef.current, "data").fingerprint, fpBefore);
  });

  it("dependency ordering: volume created before service that mounts it", async () => {
    const v = vol("data");
    const api = svc("api", {
      image: "node:20",
      mounts: [{ source: v, path: "/data" }],
    });

    const ops = transform(new Map()).add(v).add(api).build();

    ok(ops.length >= 2, "should have at least 2 levels");
    ok(
      ops[0]?.map((op) => op.urn).includes(v.urn as URN),
      "volume in first level",
    );
    ok(
      ops[1]?.map((op) => op.urn).includes(api.urn as URN),
      "service in second level",
    );

    const order: string[] = [];
    const dispatcher: Dispatcher = async (op) => {
      order.push(parseURN(op.urn).id);
      return { outputs: {} };
    };
    const stateRef = { current: new Map() as State };
    const resolve: Resolve = (urn, key) => {
      const rs = stateRef.current.get(urn);
      if (!rs) throw new Error(`Resource ${urn} not found`);
      return rs.outputs[key];
    };

    await run(ops, stateRef, dispatcher, resolve);

    ok(
      order.indexOf("data") < order.indexOf("api"),
      "volume dispatched before service",
    );
  });

  it("idempotency: re-transforming apply result produces no ops", async () => {
    const v = vol("data");
    const s = svc("api", { image: "node:20" });

    const createOps = transform(new Map()).add(v).add(s).build();
    const { stateRef, dispatcher, resolve } = setup();

    await run(createOps, stateRef, dispatcher, resolve);

    const noOps = transform(stateRef.current).build();
    strictEqual(noOps.length, 0, "no ops for unchanged state");
  });

  it("WAL entries emitted correctly through full pipeline", async () => {
    const v = vol("data");
    const s = svc("api", { image: "node:20" });

    const ops = transform(new Map()).add(v).add(s).build();
    const allEntries: WALEntry[] = [];
    const { stateRef, dispatcher, resolve } = setup();

    await run(ops, stateRef, dispatcher, resolve, (e) => allEntries.push(e));

    strictEqual(allEntries.length, 4);
    strictEqual(allEntries.filter((e) => e.type === "pending").length, 2);
    strictEqual(allEntries.filter((e) => e.type === "committed").length, 2);

    for (const e of allEntries) {
      if (e.type === "pending") strictEqual(e.action, "creating");
      if (e.type === "committed") ok(e.fingerprint);
    }
  });

  it("WAL entries for delete through full pipeline", async () => {
    const v = vol("data");
    const createOps = transform(new Map()).add(v).build();
    const { stateRef, dispatcher, resolve } = setup();

    await run(createOps, stateRef, dispatcher, resolve);

    const deleteOps = transform(stateRef.current)
      .remove(v.urn as URN)
      .build();
    const entries: WALEntry[] = [];
    await run(deleteOps, stateRef, dispatcher, resolve, (e) => entries.push(e));

    strictEqual(entries.length, 2);
    strictEqual(entries[0]?.type, "pending");
    if (entries[0]?.type === "pending")
      strictEqual(entries[0]?.action, "deleting");
    strictEqual(entries[1]?.type, "removed");
  });

  it("multiple resources at same dependency level run concurrently", async () => {
    const v1 = vol("v1");
    const v2 = vol("v2");
    const v3 = vol("v3");

    const ops = transform(new Map()).add(v1).add(v2).add(v3).build();

    strictEqual(ops.length, 1);
    strictEqual(ops[0]?.length, 3);

    const timestamps: { urn: string; start: number; end: number }[] = [];
    const dispatcher: Dispatcher = async (op) => {
      const start = Date.now();
      await new Promise((r) => setTimeout(r, 20));
      timestamps.push({ urn: op.urn, start, end: Date.now() });
      return { outputs: {} };
    };
    const stateRef = { current: new Map() as State };
    const resolve: Resolve = (urn, key) => {
      const rs = stateRef.current.get(urn);
      if (!rs) throw new Error(`Resource ${urn} not found`);
      return rs.outputs[key];
    };

    await run(ops, stateRef, dispatcher, resolve);

    const maxStart = Math.max(...timestamps.map((t) => t.start));
    const minEnd = Math.min(...timestamps.map((t) => t.end));
    ok(maxStart < minEnd, "ops should overlap in time");
  });

  it("multi-level dependency chain: secret → service → cronjob", async () => {
    const secret = sec("db-pass");
    const db = svc("db", {
      image: "postgres:17",
      env: { PASS: secret },
    });
    const backup = cron("backup", {
      image: "alpine",
      schedule: "0 2 * * *",
      dependsOn: [db],
    });

    const ops = transform(new Map()).add(secret).add(db).add(backup).build();
    strictEqual(ops.flat().length, 3);

    const order: string[] = [];
    const dispatcher: Dispatcher = async (op) => {
      order.push(parseURN(op.urn).id);
      return { outputs: {} };
    };
    const stateRef = { current: new Map() as State };
    const resolve: Resolve = (urn, key) => {
      const rs = stateRef.current.get(urn);
      if (!rs) throw new Error(`Resource ${urn} not found`);
      return rs.outputs[key];
    };

    await run(ops, stateRef, dispatcher, resolve);

    strictEqual(stateRef.current.size, 3);
    ok(order.indexOf("db-pass") < order.indexOf("db"), "secret before db");
    ok(order.indexOf("db") < order.indexOf("backup"), "db before backup");
  });

  it("successive transforms accumulate state correctly", async () => {
    const { stateRef, dispatcher, resolve } = setup();

    const v = vol("data");
    await run(
      transform(new Map()).add(v).build(),
      stateRef,
      dispatcher,
      resolve,
    );
    strictEqual(stateRef.current.size, 1);

    const api = svc("api", { image: "node:18" });
    await run(
      transform(stateRef.current).add(api).build(),
      stateRef,
      dispatcher,
      resolve,
    );
    strictEqual(stateRef.current.size, 2);

    const worker = svc("worker", { image: "worker:1" });
    const ops3 = transform(stateRef.current)
      .update(api.urn as URN, () => ({ image: "node:20", port: 3000 }))
      .add(worker)
      .build();
    await run(ops3, stateRef, dispatcher, resolve);
    strictEqual(stateRef.current.size, 3);
    deepStrictEqual(findByID(stateRef.current, "api").inputs, {
      image: "node:20",
      port: 3000,
    });

    await run(
      transform(stateRef.current)
        .remove(v.urn as URN)
        .build(),
      stateRef,
      dispatcher,
      resolve,
    );
    strictEqual(stateRef.current.size, 2);
    ok(
      ![...stateRef.current.values()].some(
        (r) => parseURN(r.urn).id === "data",
      ),
    );

    strictEqual(transform(stateRef.current).build().length, 0);
  });

  it("hydrate round-trip preserves fingerprint through apply", async () => {
    const api = svc("api", { image: "node:20", port: 8080 });
    const ops = transform(new Map()).add(api).build();
    const { stateRef, dispatcher, resolve } = setup();

    await run(ops, stateRef, dispatcher, resolve);

    const entry = [...stateRef.current.values()][0] as ResourceState;
    const resource = hydrate(entry);
    strictEqual(fingerprint(resource), entry.fingerprint);
  });
});
