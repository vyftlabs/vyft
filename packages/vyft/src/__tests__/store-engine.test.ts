import { ok, strictEqual } from "node:assert";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { CronJobConfig, ServiceConfig, URN } from "@vyft/core";
import { buildURN, INTERNAL, MOUNTABLE, parseURN } from "@vyft/core";
import type { Dispatcher } from "@vyft/engine";
import { apply, transform } from "@vyft/engine";
import { Store } from "@vyft/store";

/**
 * Store ↔ Engine integration — exercises the full orchestration loop:
 *
 *   const store = await Store.open(dir);
 *   const ops = transform(store.state).add(…).build();
 *   for (const level of ops) {
 *     await Promise.all(level.map(async (op) => {
 *       for await (const entry of apply(op, dispatcher, resolve)) {
 *         await store.append(entry);
 *       }
 *     }));
 *   }
 *   await store.checkpoint();
 *   await store.dispose();
 */

// ── Resource helpers ─────────────────────────────────────────────────

function vol(id: string) {
  return {
    kind: "volume" as const,
    id,
    urn: buildURN("platform", "default", "volume", id),
    config: {},
    [MOUNTABLE]: true,
  };
}

function sec(id: string) {
  return {
    kind: "variable" as const,
    id,
    urn: buildURN("platform", "default", "variable", id),
    config: {},
  };
}

function svc(id: string, config: ServiceConfig = { image: "test" }) {
  const port = config.port ?? 3000;
  return {
    kind: "service" as const,
    id,
    urn: buildURN("runtime", "default", "service", id),
    config,
    host: id,
    port,
    url: `http://${id}:${port}`,
    [INTERNAL]: { ready: async () => {} },
  };
}

function cron(id: string, config: CronJobConfig) {
  return {
    kind: "cronjob" as const,
    id,
    urn: buildURN("runtime", "default", "cronjob", id),
    config,
  };
}

function noopDispatcher(
  outputMap: Record<string, Record<string, unknown>> = {},
): Dispatcher {
  return async (op) => ({
    outputs: outputMap[parseURN(op.urn).id] ?? {},
  });
}

/** Build a resolve function from store state. */
function resolveFrom(state: Map<URN, { outputs: Record<string, unknown> }>) {
  return (urn: URN, key: string) => state.get(urn)?.outputs[key];
}

/** Run ops through apply, appending entries to store. */
async function runOps(
  ops: ReturnType<ReturnType<typeof transform>["build"]>,
  store: Store,
  dispatcher: Dispatcher,
) {
  for (const level of ops) {
    await Promise.all(
      level.map(async (op) => {
        for await (const entry of apply(
          op,
          dispatcher,
          resolveFrom(store.state),
        )) {
          await store.append(entry);
        }
      }),
    );
  }
}

// ── Tests ────────────────────────────────────────────────────────────

describe("Store + Engine orchestration", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "vyft-store-engine-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("fresh deploy: open → transform → apply → flush → reopen", async () => {
    const dir = join(root, "s");
    const dispatcher = noopDispatcher({
      api: { host: "api", port: 3000 },
    });

    const store = await Store.open(dir);
    const ops = transform(store.state)
      .add(vol("data"))
      .add(svc("api", { image: "node:20" }))
      .build();

    await runOps(ops, store, dispatcher);
    await store.checkpoint();
    await store.dispose();

    const store2 = await Store.open(dir);
    strictEqual(store2.state.size, 2);
    ok([...store2.state.values()].some((r) => parseURN(r.urn).id === "data"));
    const api = [...store2.state.values()].find(
      (r) => parseURN(r.urn).id === "api",
    );
    ok(api, "api resource should exist in state");
    strictEqual(api.outputs["host"], "api");
    await store2.dispose();
  });

  it("idempotent: re-transform produces no ops", async () => {
    const dir = join(root, "s");
    const dispatcher = noopDispatcher();

    const store = await Store.open(dir);
    await runOps(
      transform(store.state).add(vol("data")).build(),
      store,
      dispatcher,
    );
    await store.checkpoint();
    await store.dispose();

    const store2 = await Store.open(dir);
    strictEqual(transform(store2.state).build().length, 0);
    await store2.dispose();
  });

  it("update: config change → update op → new fingerprint", async () => {
    const dir = join(root, "s");
    const dispatcher = noopDispatcher();

    const store = await Store.open(dir);
    await runOps(
      transform(store.state).add(vol("data")).build(),
      store,
      dispatcher,
    );
    await store.checkpoint();
    const first = [...store.state.values()][0];
    const fp1 = first?.fingerprint;
    const created = first?.created;
    await store.dispose();

    const store2 = await Store.open(dir);
    const urn = [...store2.state.values()][0]?.urn;
    const ops = transform(store2.state)
      .update(urn!, (cfg) => ({ ...cfg, size: "10Gi" }))
      .build();
    ok(ops.flat().some((op) => op.action === "update"));

    await runOps(ops, store2, dispatcher);
    await store2.checkpoint();
    await store2.dispose();

    const store3 = await Store.open(dir);
    const entry = [...store3.state.values()][0];
    ok(entry?.fingerprint !== fp1, "fingerprint changed");
    strictEqual(entry?.inputs["size"], "10Gi");
    strictEqual(entry?.created, created, "created preserved");
    await store3.dispose();
  });

  it("delete: resource removed from state", async () => {
    const dir = join(root, "s");
    const dispatcher = noopDispatcher();

    const store = await Store.open(dir);
    await runOps(
      transform(store.state).add(vol("a")).add(vol("b")).build(),
      store,
      dispatcher,
    );
    await store.checkpoint();
    await store.dispose();

    const store2 = await Store.open(dir);
    const aUrn = [...store2.state.values()].find(
      (r) => parseURN(r.urn).id === "a",
    )?.urn;
    await runOps(
      transform(store2.state).remove(aUrn!).build(),
      store2,
      dispatcher,
    );
    await store2.checkpoint();
    await store2.dispose();

    const store3 = await Store.open(dir);
    strictEqual(store3.state.size, 1);
    const entry = [...store3.state.values()][0];
    strictEqual(parseURN(entry!.urn).id, "b");
    await store3.dispose();
  });

  it("WAL crash recovery: unflushed WAL replayed on reopen", async () => {
    const dir = join(root, "s");
    const dispatcher = noopDispatcher();

    // Deploy and flush
    const store = await Store.open(dir);
    await runOps(
      transform(store.state).add(vol("data")).build(),
      store,
      dispatcher,
    );
    await store.checkpoint();
    await store.dispose();

    // Deploy a second resource but DON'T flush (crash simulation)
    const store2 = await Store.open(dir);
    await runOps(
      transform(store2.state).add(vol("cache")).build(),
      store2,
      dispatcher,
    );
    strictEqual(store2.state.size, 2);
    // store2.checkpoint() — intentionally skipped
    await store2.dispose();

    // Reopen: WAL replayed, both resources present
    const store3 = await Store.open(dir);
    strictEqual(store3.state.size, 2);
    ok([...store3.state.values()].some((r) => parseURN(r.urn).id === "data"));
    ok([...store3.state.values()].some((r) => parseURN(r.urn).id === "cache"));
    await store3.checkpoint();
    await store3.dispose();
  });

  it("full lifecycle: create → update → delete → empty", async () => {
    const dir = join(root, "s");
    const dispatcher = noopDispatcher();

    // Create
    const s1 = await Store.open(dir);
    await runOps(transform(s1.state).add(vol("data")).build(), s1, dispatcher);
    await s1.checkpoint();
    const first = [...s1.state.values()][0];
    const created = first?.created;
    const urn = first?.urn;
    await s1.dispose();

    // Update
    const s2 = await Store.open(dir);
    await runOps(
      transform(s2.state)
        .update(urn!, () => ({ size: "50Gi" }))
        .build(),
      s2,
      dispatcher,
    );
    await s2.checkpoint();
    const updated = [...s2.state.values()][0];
    strictEqual(updated?.inputs["size"], "50Gi");
    strictEqual(updated?.created, created);
    await s2.dispose();

    // Delete
    const s3 = await Store.open(dir);
    await runOps(transform(s3.state).remove(urn!).build(), s3, dispatcher);
    await s3.checkpoint();
    strictEqual(s3.state.size, 0);
    await s3.dispose();

    // Verify empty
    const s4 = await Store.open(dir);
    strictEqual(s4.state.size, 0);
    await s4.dispose();
  });

  it("dependency ordering preserved through store", async () => {
    const dir = join(root, "s");
    const order: string[] = [];
    const dispatcher: Dispatcher = async (op) => {
      order.push(parseURN(op.urn).id);
      return {};
    };

    const secret = sec("db-pass");
    const db = svc("db", { image: "postgres:17", env: { PASS: secret } });
    const backup = cron("backup", {
      image: "alpine",
      schedule: "0 2 * * *",
      dependsOn: [db],
    });

    const store = await Store.open(dir);
    await runOps(
      transform(store.state).add(secret).add(db).add(backup).build(),
      store,
      dispatcher,
    );
    await store.checkpoint();
    await store.dispose();

    ok(order.indexOf("db-pass") < order.indexOf("db"));
    ok(order.indexOf("db") < order.indexOf("backup"));

    const store2 = await Store.open(dir);
    strictEqual(store2.state.size, 3);
    await store2.dispose();
  });

  it("concurrent ops within a level all persisted", async () => {
    const dir = join(root, "s");
    const dispatcher: Dispatcher = async (op) => {
      await new Promise((r) => setTimeout(r, 10));
      return { outputs: { id: parseURN(op.urn).id } };
    };

    const store = await Store.open(dir);
    const ops = transform(store.state)
      .add(vol("v1"))
      .add(vol("v2"))
      .add(vol("v3"))
      .build();

    strictEqual(ops.length, 1);
    strictEqual(ops[0]?.length, 3);

    await runOps(ops, store, dispatcher);
    await store.checkpoint();
    await store.dispose();

    const store2 = await Store.open(dir);
    strictEqual(store2.state.size, 3);
    for (const rs of store2.state.values()) {
      strictEqual(rs.outputs["id"], parseURN(rs.urn).id);
    }
    await store2.dispose();
  });
});
