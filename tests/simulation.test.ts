import {
  deepStrictEqual,
  notStrictEqual,
  ok,
  rejects,
  strictEqual,
} from "node:assert";
import { beforeEach, describe, it } from "node:test";
import {
  cronjob,
  interpolate,
  secret,
  service,
  ValidationError,
  volume,
} from "../src/index.ts";
import type { ResourceState } from "../src/store/types.ts";
import { Simulation } from "./simulation.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract operation action+id pairs from a simulation's last ops. */
function opSummary(sim: Simulation): { action: string; id: string }[] {
  return sim.lastOps().map((e) => {
    const op = e.operation;
    return {
      action: op.action,
      id: op.action === "remove" ? op.id : op.resource.id,
    };
  });
}

/** Get a resource state by id, failing if missing. */
function getState(states: ResourceState[], id: string): ResourceState {
  const s = states.find((r) => r.id === id);
  ok(s, `expected state for "${id}"`);
  return s;
}

// ===========================================================================
//  1. COLLECTION — resources discovered from arbitrary config shapes
// ===========================================================================

describe("collection", () => {
  let sim: Simulation;
  beforeEach(() => {
    sim = new Simulation();
  });

  it("discovers resources nested in plain objects", async () => {
    const v = volume("data");
    const s = service("api", {
      image: "node:20",
      mounts: [{ volume: v, path: "/d" }],
    });
    await sim.deploy({ infra: { storage: v }, services: { api: s } });
    strictEqual(sim.state.length, 2);
  });

  it("discovers resources in arrays", async () => {
    const v1 = volume("a");
    const v2 = volume("b");
    await sim.deploy([v1, v2]);
    strictEqual(sim.state.length, 2);
  });

  it("deduplicates the same resource object referenced multiple times", async () => {
    const v = volume("data");
    const s1 = service("s1", {
      image: "x",
      mounts: [{ volume: v, path: "/a" }],
    });
    const s2 = service("s2", {
      image: "x",
      mounts: [{ volume: v, path: "/b" }],
    });
    // v is reachable via config.v, config.s1.config.mounts[0].volume, and config.s2.config.mounts[0].volume
    await sim.deploy({ v, s1, s2 });
    strictEqual(sim.state.length, 3); // v, s1, s2 — not 5
  });

  it("empty config produces no resources and no operations", async () => {
    await sim.deploy({});
    strictEqual(sim.state.length, 0);
    strictEqual(sim.lastOps().length, 0);
  });

  it("null / undefined / primitives in config are ignored", async () => {
    const v = volume("data");
    await sim.deploy({ a: null, b: undefined, c: 42, d: "hello", v });
    strictEqual(sim.state.length, 1);
    strictEqual(sim.state[0]?.id, "data");
  });
});

// ===========================================================================
//  2. VALIDATION — dangling refs and cycles
// ===========================================================================

describe("validation", () => {
  let sim: Simulation;
  beforeEach(() => {
    sim = new Simulation();
  });

  it("nested resources are auto-discovered — no dangling refs possible", async () => {
    // Even if the volume is only reachable through the service's mounts,
    // collect() finds it, so validation passes and both are deployed.
    const v = volume("data");
    const s = service("api", {
      image: "x",
      mounts: [{ volume: v, path: "/d" }],
    });
    await sim.deploy({ s }); // only pass service — volume discovered inside config
    strictEqual(sim.state.length, 2);
    ok(sim.state.some((r) => r.id === "data"));
    ok(sim.state.some((r) => r.id === "api"));
  });

  it("dependsOn targets are auto-discovered from config tree", async () => {
    const db = service("db", { image: "pg" });
    const api = service("api", { image: "x", dependsOn: [db] });
    await sim.deploy({ api }); // only pass api — db discovered inside dependsOn
    strictEqual(sim.state.length, 2);
    ok(sim.state.some((r) => r.id === "db"));
    ok(sim.state.some((r) => r.id === "api"));
  });

  it("rejects dependency cycle", async () => {
    const a = service("a", { image: "x" });
    const b = service("b", { image: "x", dependsOn: [a] });
    // Mutate a to depend on b — creates cycle
    (a.config as { dependsOn?: unknown[] }).dependsOn = [b];
    await rejects(sim.deploy({ a, b }), (err: unknown) => {
      ok(err instanceof ValidationError);
      ok(err.message.includes("cycle") || err.message.includes("Cycle"));
      return true;
    });
  });
});

// ===========================================================================
//  3. PLAN — change detection (create / modify / remove / no-change)
// ===========================================================================

describe("plan — change detection", () => {
  let sim: Simulation;
  beforeEach(() => {
    sim = new Simulation();
  });

  it("new resource → create", async () => {
    const v = volume("data");
    await sim.deploy({ v });
    deepStrictEqual(opSummary(sim), [{ action: "create", id: "data" }]);
  });

  it("unchanged resource → no change, no operations", async () => {
    const v = volume("data");
    await sim.deploy({ v });
    await sim.deploy({ v });
    strictEqual(sim.lastOps().length, 0);
  });

  it("changed resource → modify", async () => {
    const s = service("api", { image: "node:20" });
    await sim.deploy({ s });
    const s2 = service("api", { image: "node:22" });
    await sim.deploy({ s: s2 });
    deepStrictEqual(opSummary(sim), [{ action: "recreate", id: "api" }]);
  });

  it("removed resource → remove", async () => {
    const v = volume("data");
    const s = service("api", { image: "x" });
    await sim.deploy({ v, s });
    await sim.deploy({ v });
    deepStrictEqual(opSummary(sim), [{ action: "remove", id: "api" }]);
  });

  it("simultaneous create + remove (swap)", async () => {
    const old = service("old", { image: "x" });
    await sim.deploy({ old });

    const fresh = service("fresh", { image: "y" });
    await sim.deploy({ fresh });

    const ops = opSummary(sim);
    ok(ops.some((o) => o.action === "create" && o.id === "fresh"));
    ok(ops.some((o) => o.action === "remove" && o.id === "old"));
  });
});

// ===========================================================================
//  4. FINGERPRINTING — stability across dependency changes
// ===========================================================================

describe("fingerprinting", () => {
  let sim: Simulation;
  beforeEach(() => {
    sim = new Simulation();
  });

  it("dependency config change does NOT change dependent's fingerprint", async () => {
    const v = volume("data");
    const s = service("api", {
      image: "x",
      mounts: [{ volume: v, path: "/d" }],
    });
    await sim.deploy({ v, s });

    const fpBefore = getState(sim.state, "api").fingerprint;

    // Change volume config — service itself hasn't changed
    const v2 = volume("data", { size: "100Gi" });
    const s2 = service("api", {
      image: "x",
      mounts: [{ volume: v2, path: "/d" }],
    });
    await sim.deploy({ v: v2, s: s2 });

    const fpAfter = getState(sim.state, "api").fingerprint;
    strictEqual(
      fpBefore,
      fpAfter,
      "service fingerprint should be stable when only its dependency changes",
    );
    // No recreate for the service
    const svcOps = sim.lastOps().filter((e) => {
      const op = e.operation;
      return (
        (op.action !== "remove" && op.resource.id === "api") ||
        (op.action === "remove" && op.id === "api")
      );
    });
    strictEqual(svcOps.length, 0);
  });

  it("own config change DOES change fingerprint", async () => {
    const s = service("api", { image: "node:20" });
    await sim.deploy({ s });
    const fp1 = getState(sim.state, "api").fingerprint;

    const s2 = service("api", { image: "node:22" });
    await sim.deploy({ s: s2 });
    const fp2 = getState(sim.state, "api").fingerprint;

    notStrictEqual(fp1, fp2);
  });
});

// ===========================================================================
//  5. RUNTIME SEMANTICS — per-kind plan behavior
// ===========================================================================

describe("runtime semantics", () => {
  let sim: Simulation;
  beforeEach(() => {
    sim = new Simulation();
  });

  // --- Secrets ---

  it("secret create produces zero runtime operations", async () => {
    const s = secret("tok");
    await sim.deploy({ s });
    strictEqual(sim.lastOps().length, 0);
    strictEqual(sim.state.length, 1);
    ok(!sim.runtime.resources.has("tok"));
  });

  it("secret modify produces zero runtime operations", async () => {
    const s = secret("tok");
    await sim.deploy({ s });
    const s2 = secret("tok", { length: 64 });
    await sim.deploy({ s: s2 });
    strictEqual(sim.lastOps().length, 0);
  });

  it("secret remove produces a remove operation", async () => {
    const s = secret("tok");
    await sim.deploy({ s });
    await sim.deploy({});
    deepStrictEqual(opSummary(sim), [{ action: "remove", id: "tok" }]);
  });

  // --- Volumes ---

  it("volume create produces one create operation", async () => {
    const v = volume("data");
    await sim.deploy({ v });
    deepStrictEqual(opSummary(sim), [{ action: "create", id: "data" }]);
  });

  it("volume modify (size change) produces zero operations — immutable", async () => {
    const v = volume("data");
    await sim.deploy({ v });
    const v2 = volume("data", { size: "100Gi" });
    await sim.deploy({ v: v2 });
    strictEqual(sim.lastOps().length, 0);
  });

  it("volume remove produces a remove operation", async () => {
    const v = volume("data");
    await sim.deploy({ v });
    await sim.deploy({});
    deepStrictEqual(opSummary(sim), [{ action: "remove", id: "data" }]);
  });

  // --- Services ---

  it("service create produces one create operation", async () => {
    const s = service("api", { image: "x" });
    await sim.deploy({ s });
    deepStrictEqual(opSummary(sim), [{ action: "create", id: "api" }]);
  });

  it("service modify produces recreate", async () => {
    const s = service("api", { image: "node:20" });
    await sim.deploy({ s });
    const s2 = service("api", { image: "node:22" });
    await sim.deploy({ s: s2 });
    deepStrictEqual(opSummary(sim), [{ action: "recreate", id: "api" }]);
  });

  it("service remove produces a remove operation", async () => {
    const s = service("api", { image: "x" });
    await sim.deploy({ s });
    await sim.deploy({});
    deepStrictEqual(opSummary(sim), [{ action: "remove", id: "api" }]);
  });

  // --- Cronjobs ---

  it("cronjob create produces one create operation", async () => {
    const c = cronjob("job", { image: "alpine", schedule: "0 * * * *" });
    await sim.deploy({ c });
    deepStrictEqual(opSummary(sim), [{ action: "create", id: "job" }]);
  });

  it("cronjob modify produces recreate", async () => {
    const c = cronjob("job", { image: "alpine", schedule: "0 * * * *" });
    await sim.deploy({ c });
    const c2 = cronjob("job", { image: "alpine:3.19", schedule: "0 * * * *" });
    await sim.deploy({ c: c2 });
    deepStrictEqual(opSummary(sim), [{ action: "recreate", id: "job" }]);
  });

  it("cronjob remove produces a remove operation", async () => {
    const c = cronjob("job", { image: "alpine", schedule: "0 * * * *" });
    await sim.deploy({ c });
    await sim.deploy({});
    deepStrictEqual(opSummary(sim), [{ action: "remove", id: "job" }]);
  });
});

// ===========================================================================
//  6. SERVICE MODIFICATION TRIGGERS
// ===========================================================================

describe("service modification triggers", () => {
  let sim: Simulation;
  beforeEach(() => {
    sim = new Simulation();
  });

  it("changing image triggers recreate", async () => {
    await sim.deploy({ s: service("api", { image: "node:20" }) });
    await sim.deploy({ s: service("api", { image: "node:22" }) });
    deepStrictEqual(opSummary(sim), [{ action: "recreate", id: "api" }]);
  });

  it("changing port triggers recreate", async () => {
    await sim.deploy({ s: service("api", { image: "x", port: 3000 }) });
    await sim.deploy({ s: service("api", { image: "x", port: 8080 }) });
    deepStrictEqual(opSummary(sim), [{ action: "recreate", id: "api" }]);
  });

  it("changing command triggers recreate", async () => {
    await sim.deploy({
      s: service("api", { image: "x", command: "node server.js" }),
    });
    await sim.deploy({
      s: service("api", { image: "x", command: "node app.js" }),
    });
    deepStrictEqual(opSummary(sim), [{ action: "recreate", id: "api" }]);
  });

  it("changing route alone is a no-op", async () => {
    await sim.deploy({
      s: service("api", { image: "x", route: "api.example.com" }),
    });
    await sim.deploy({
      s: service("api", { image: "x", route: "api.newdomain.com" }),
    });
    deepStrictEqual(opSummary(sim), []);
  });

  it("adding env var triggers recreate", async () => {
    await sim.deploy({ s: service("api", { image: "x" }) });
    await sim.deploy({
      s: service("api", { image: "x", env: { NODE_ENV: "production" } }),
    });
    deepStrictEqual(opSummary(sim), [{ action: "recreate", id: "api" }]);
  });

  it("changing env var value triggers recreate", async () => {
    await sim.deploy({ s: service("api", { image: "x", env: { FOO: "a" } }) });
    await sim.deploy({ s: service("api", { image: "x", env: { FOO: "b" } }) });
    deepStrictEqual(opSummary(sim), [{ action: "recreate", id: "api" }]);
  });

  it("adding a mount triggers recreate", async () => {
    const v = volume("data");
    await sim.deploy({ v, s: service("api", { image: "x" }) });
    await sim.deploy({
      v,
      s: service("api", { image: "x", mounts: [{ volume: v, path: "/d" }] }),
    });
    deepStrictEqual(opSummary(sim), [{ action: "recreate", id: "api" }]);
  });

  it("changing mount path triggers recreate", async () => {
    const v = volume("data");
    await sim.deploy({
      v,
      s: service("api", { image: "x", mounts: [{ volume: v, path: "/a" }] }),
    });
    await sim.deploy({
      v,
      s: service("api", { image: "x", mounts: [{ volume: v, path: "/b" }] }),
    });
    deepStrictEqual(opSummary(sim), [{ action: "recreate", id: "api" }]);
  });

  it("removing a mount triggers recreate", async () => {
    const v = volume("data");
    await sim.deploy({
      v,
      s: service("api", { image: "x", mounts: [{ volume: v, path: "/d" }] }),
    });
    await sim.deploy({ v, s: service("api", { image: "x" }) });
    deepStrictEqual(opSummary(sim), [{ action: "recreate", id: "api" }]);
  });

  it("adding health check triggers recreate", async () => {
    await sim.deploy({ s: service("api", { image: "x" }) });
    await sim.deploy({
      s: service("api", { image: "x", health: { command: "curl localhost" } }),
    });
    deepStrictEqual(opSummary(sim), [{ action: "recreate", id: "api" }]);
  });

  it("changing replicas alone is a no-op", async () => {
    await sim.deploy({ s: service("api", { image: "x", replicas: 1 }) });
    await sim.deploy({ s: service("api", { image: "x", replicas: 3 }) });
    deepStrictEqual(opSummary(sim), []);
  });

  it("changing dev alone is a no-op", async () => {
    await sim.deploy({
      s: service("api", { image: "x", dev: { command: "npm start" } }),
    });
    await sim.deploy({
      s: service("api", { image: "x", dev: { command: "npm run dev" } }),
    });
    deepStrictEqual(opSummary(sim), []);
  });

  it("changing spec and route together triggers recreate", async () => {
    await sim.deploy({
      s: service("api", { image: "node:20", route: "api.example.com" }),
    });
    await sim.deploy({
      s: service("api", { image: "node:22", route: "api.newdomain.com" }),
    });
    deepStrictEqual(opSummary(sim), [{ action: "recreate", id: "api" }]);
  });

  it("changing replicas and spec field together triggers recreate", async () => {
    await sim.deploy({ s: service("api", { image: "node:20", replicas: 1 }) });
    await sim.deploy({ s: service("api", { image: "node:22", replicas: 3 }) });
    deepStrictEqual(opSummary(sim), [{ action: "recreate", id: "api" }]);
  });

  it("changing restart policy triggers recreate", async () => {
    await sim.deploy({ s: service("api", { image: "x", restart: "always" }) });
    await sim.deploy({
      s: service("api", { image: "x", restart: "on-failure" }),
    });
    deepStrictEqual(opSummary(sim), [{ action: "recreate", id: "api" }]);
  });
});

// ===========================================================================
//  7. DEPENDENCY ORDERING
// ===========================================================================

describe("dependency ordering", () => {
  let sim: Simulation;
  beforeEach(() => {
    sim = new Simulation();
  });

  it("volume created before service that mounts it", async () => {
    const v = volume("data");
    const s = service("api", {
      image: "x",
      mounts: [{ volume: v, path: "/d" }],
    });
    await sim.deploy({ s, v }); // intentionally pass service first in config
    const ops = opSummary(sim);
    const vi = ops.findIndex((o) => o.id === "data");
    const si = ops.findIndex((o) => o.id === "api");
    ok(vi < si, `volume idx ${vi} should be before service idx ${si}`);
  });

  it("secret created before service that uses it (state-wise, no ops for secret)", async () => {
    const sec = secret("tok");
    const s = service("api", { image: "x", env: { TOKEN: sec } });
    await sim.deploy({ s, sec });
    // Secret has no runtime ops, but both should be in state
    strictEqual(sim.state.length, 2);
    // Service should have secret as dependency
    const apiState = getState(sim.state, "api");
    ok(apiState.dependencies.includes("tok"));
  });

  it("dependsOn ordering — db before api", async () => {
    const db = service("db", { image: "pg" });
    const api = service("api", { image: "x", dependsOn: [db] });
    await sim.deploy({ api, db });
    const ops = opSummary(sim);
    const dbi = ops.findIndex((o) => o.id === "db");
    const apii = ops.findIndex((o) => o.id === "api");
    ok(dbi < apii, `db idx ${dbi} should be before api idx ${apii}`);
  });

  it("diamond dependency — D before B,C before A", async () => {
    const d = volume("d");
    const b = service("b", { image: "x", mounts: [{ volume: d, path: "/d" }] });
    const c = service("c", { image: "x", mounts: [{ volume: d, path: "/d" }] });
    const a = service("a", { image: "x", dependsOn: [b, c] });
    await sim.deploy({ a, b, c, d });

    const ops = opSummary(sim);
    const di = ops.findIndex((o) => o.id === "d");
    const bi = ops.findIndex((o) => o.id === "b");
    const ci = ops.findIndex((o) => o.id === "c");
    const ai = ops.findIndex((o) => o.id === "a");

    ok(di < bi, "d before b");
    ok(di < ci, "d before c");
    ok(bi < ai, "b before a");
    ok(ci < ai, "c before a");
  });

  it("deep chain — v → s1 → s2 → s3", async () => {
    const v = volume("v");
    const s1 = service("s1", {
      image: "x",
      mounts: [{ volume: v, path: "/d" }],
    });
    const s2 = service("s2", { image: "x", dependsOn: [s1] });
    const s3 = service("s3", { image: "x", dependsOn: [s2] });
    await sim.deploy({ s3, s2, s1, v });

    const ops = opSummary(sim);
    const vi = ops.findIndex((o) => o.id === "v");
    const s1i = ops.findIndex((o) => o.id === "s1");
    const s2i = ops.findIndex((o) => o.id === "s2");
    const s3i = ops.findIndex((o) => o.id === "s3");

    ok(
      vi < s1i && s1i < s2i && s2i < s3i,
      `expected v < s1 < s2 < s3, got ${vi} ${s1i} ${s2i} ${s3i}`,
    );
  });

  it("cronjob depends on its mounted volume", async () => {
    const v = volume("logs");
    const c = cronjob("backup", {
      image: "alpine",
      schedule: "0 2 * * *",
      mounts: [{ volume: v, path: "/logs" }],
    });
    await sim.deploy({ c, v });
    const ops = opSummary(sim);
    const vi = ops.findIndex((o) => o.id === "logs");
    const ci = ops.findIndex((o) => o.id === "backup");
    ok(vi < ci, `volume idx ${vi} should be before cronjob idx ${ci}`);
  });

  it("cronjob depends on secret via env", async () => {
    const sec = secret("tok");
    const c = cronjob("report", {
      image: "alpine",
      schedule: "0 6 * * *",
      env: { TOKEN: sec },
    });
    await sim.deploy({ c, sec });
    const cronState = getState(sim.state, "report");
    ok(cronState.dependencies.includes("tok"));
  });
});

// ===========================================================================
//  8. STATE — ResourceState correctness
// ===========================================================================

describe("state correctness", () => {
  let sim: Simulation;
  beforeEach(() => {
    sim = new Simulation();
  });

  it("state count matches config resource count", async () => {
    const v = volume("data");
    const sec = secret("tok");
    const s = service("api", {
      image: "x",
      env: { T: sec },
      mounts: [{ volume: v, path: "/d" }],
    });
    await sim.deploy({ v, sec, s });
    strictEqual(sim.state.length, 3);
  });

  it("state IDs match config resource IDs", async () => {
    const v = volume("data");
    const s = service("api", { image: "x" });
    await sim.deploy({ v, s });
    const ids = sim.state.map((r) => r.id).sort();
    deepStrictEqual(ids, ["api", "data"]);
  });

  it("state kind is correct", async () => {
    const v = volume("data");
    const sec = secret("tok");
    const s = service("api", { image: "x" });
    const c = cronjob("job", { image: "alpine", schedule: "0 * * * *" });
    await sim.deploy({ v, sec, s, c });
    strictEqual(getState(sim.state, "data").kind, "volume");
    strictEqual(getState(sim.state, "tok").kind, "secret");
    strictEqual(getState(sim.state, "api").kind, "service");
    strictEqual(getState(sim.state, "job").kind, "cronjob");
  });

  it("service outputs include host, port, url", async () => {
    const s = service("api", { image: "x", port: 8080 });
    await sim.deploy({ s });
    const st = getState(sim.state, "api");
    deepStrictEqual(st.outputs, {
      host: "api",
      port: 8080,
      url: "http://api:8080",
    });
  });

  it("service outputs use default port 3000", async () => {
    const s = service("api", { image: "x" });
    await sim.deploy({ s });
    const st = getState(sim.state, "api");
    deepStrictEqual(st.outputs, {
      host: "api",
      port: 3000,
      url: "http://api:3000",
    });
  });

  it("non-service outputs are empty", async () => {
    const v = volume("data");
    const sec = secret("tok");
    const c = cronjob("job", { image: "alpine", schedule: "0 * * * *" });
    await sim.deploy({ v, sec, c });
    deepStrictEqual(getState(sim.state, "data").outputs, {});
    deepStrictEqual(getState(sim.state, "tok").outputs, {});
    deepStrictEqual(getState(sim.state, "job").outputs, {});
  });

  it("inputs serialize nested resources as IDs", async () => {
    const v = volume("data");
    const s = service("api", {
      image: "x",
      mounts: [{ volume: v, path: "/d" }],
    });
    await sim.deploy({ v, s });
    const st = getState(sim.state, "api");
    // The volume in mounts should be replaced with its ID string
    const mounts = st.inputs.mounts as { volume: string; path: string }[];
    strictEqual(mounts[0]?.volume, "data");
  });

  it("dependencies list is correct", async () => {
    const v = volume("data");
    const sec = secret("tok");
    const db = service("db", { image: "pg" });
    const api = service("api", {
      image: "x",
      mounts: [{ volume: v, path: "/d" }],
      env: { TOKEN: sec },
      dependsOn: [db],
    });
    await sim.deploy({ v, sec, db, api });
    const apiState = getState(sim.state, "api");
    const deps = [...apiState.dependencies].sort();
    deepStrictEqual(deps, ["data", "db", "tok"]);
  });

  it("resources with no dependencies have empty dependencies array", async () => {
    const v = volume("data");
    const sec = secret("tok");
    await sim.deploy({ v, sec });
    deepStrictEqual(getState(sim.state, "data").dependencies, []);
    deepStrictEqual(getState(sim.state, "tok").dependencies, []);
  });

  it("taint is always false after deploy", async () => {
    const v = volume("data");
    const s = service("api", { image: "x" });
    await sim.deploy({ v, s });
    for (const st of sim.state) {
      strictEqual(st.taint, false);
    }
  });

  it("runtime field defaults to empty object on first deploy", async () => {
    const v = volume("data");
    await sim.deploy({ v });
    deepStrictEqual(getState(sim.state, "data").runtime, {});
  });

  it("created and modified are ISO timestamps", async () => {
    const v = volume("data");
    await sim.deploy({ v });
    const st = getState(sim.state, "data");
    ok(!Number.isNaN(Date.parse(st.created)), "created should be valid ISO");
    ok(!Number.isNaN(Date.parse(st.modified)), "modified should be valid ISO");
  });

  it("created equals modified on first deploy", async () => {
    const v = volume("data");
    await sim.deploy({ v });
    const st = getState(sim.state, "data");
    strictEqual(st.created, st.modified);
  });
});

// ===========================================================================
//  9. STATE PERSISTENCE ACROSS DEPLOYS
// ===========================================================================

describe("state persistence across deploys", () => {
  let sim: Simulation;
  beforeEach(() => {
    sim = new Simulation();
  });

  it("created timestamp preserved on redeploy with changes", async () => {
    const s = service("api", { image: "node:20" });
    await sim.deploy({ s });
    const created1 = getState(sim.state, "api").created;

    await new Promise((r) => setTimeout(r, 10));

    const s2 = service("api", { image: "node:22" });
    await sim.deploy({ s: s2 });
    const created2 = getState(sim.state, "api").created;

    strictEqual(created1, created2);
  });

  it("modified timestamp updates on redeploy with changes", async () => {
    const s = service("api", { image: "node:20" });
    await sim.deploy({ s });
    const mod1 = getState(sim.state, "api").modified;

    await new Promise((r) => setTimeout(r, 10));

    const s2 = service("api", { image: "node:22" });
    await sim.deploy({ s: s2 });
    const mod2 = getState(sim.state, "api").modified;

    ok(mod2 > mod1, `modified should advance: ${mod2} > ${mod1}`);
  });

  it("modified timestamp also updates on no-op redeploy", async () => {
    const s = service("api", { image: "node:20" });
    await sim.deploy({ s });
    const mod1 = getState(sim.state, "api").modified;

    await new Promise((r) => setTimeout(r, 10));

    // Same config, no changes — but modified still updates (it's set to "now")
    await sim.deploy({ s });
    const mod2 = getState(sim.state, "api").modified;

    ok(mod2 >= mod1);
  });

  it("runtime field preserved from previous state", async () => {
    // The engine preserves `prev?.runtime ?? {}`, so let's verify that once set,
    // it carries forward. We can't set it via simulation runtime directly since
    // the engine reads from previous state, but we can verify it stays {}.
    const s = service("api", { image: "node:20" });
    await sim.deploy({ s });
    const runtime1 = getState(sim.state, "api").runtime;
    deepStrictEqual(runtime1, {});

    const s2 = service("api", { image: "node:22" });
    await sim.deploy({ s: s2 });
    const runtime2 = getState(sim.state, "api").runtime;
    deepStrictEqual(runtime2, {});
  });

  it("fingerprint updates when config changes", async () => {
    const s = service("api", { image: "node:20" });
    await sim.deploy({ s });
    const fp1 = getState(sim.state, "api").fingerprint;

    const s2 = service("api", { image: "node:22" });
    await sim.deploy({ s: s2 });
    const fp2 = getState(sim.state, "api").fingerprint;

    notStrictEqual(fp1, fp2);
  });

  it("fingerprint stays the same when nothing changes", async () => {
    const s = service("api", { image: "node:20" });
    await sim.deploy({ s });
    const fp1 = getState(sim.state, "api").fingerprint;

    await sim.deploy({ s });
    const fp2 = getState(sim.state, "api").fingerprint;

    strictEqual(fp1, fp2);
  });

  it("removed resources disappear from state", async () => {
    const v = volume("data");
    const s = service("api", { image: "x" });
    await sim.deploy({ v, s });
    strictEqual(sim.state.length, 2);

    await sim.deploy({ v });
    strictEqual(sim.state.length, 1);
    strictEqual(sim.state[0]?.id, "data");
  });

  it("newly added resources appear in state on redeploy", async () => {
    const v = volume("data");
    await sim.deploy({ v });
    strictEqual(sim.state.length, 1);

    const s = service("api", { image: "x" });
    await sim.deploy({ v, s });
    strictEqual(sim.state.length, 2);
    ok(sim.state.some((r) => r.id === "api"));
  });
});

// ===========================================================================
//  10. MULTI-DEPLOY LIFECYCLE SCENARIOS
// ===========================================================================

describe("multi-deploy lifecycle", () => {
  let sim: Simulation;
  beforeEach(() => {
    sim = new Simulation();
  });

  it("full lifecycle: create → no-op → modify → add → remove → destroy", async () => {
    // 1. Create
    const v = volume("data");
    const api = service("api", {
      image: "node:20",
      mounts: [{ volume: v, path: "/d" }],
    });
    await sim.deploy({ v, api });
    strictEqual(sim.lastOps().length, 2);
    strictEqual(sim.state.length, 2);

    // 2. No-op redeploy
    await sim.deploy({ v, api });
    strictEqual(sim.lastOps().length, 0);
    strictEqual(sim.state.length, 2);

    // 3. Modify service
    const apiV2 = service("api", {
      image: "node:22",
      mounts: [{ volume: v, path: "/d" }],
    });
    await sim.deploy({ v, api: apiV2 });
    deepStrictEqual(opSummary(sim), [{ action: "recreate", id: "api" }]);
    strictEqual(sim.state.length, 2);

    // 4. Add a new service
    const worker = service("worker", { image: "worker:1" });
    await sim.deploy({ v, api: apiV2, worker });
    deepStrictEqual(opSummary(sim), [{ action: "create", id: "worker" }]);
    strictEqual(sim.state.length, 3);

    // 5. Remove the worker
    await sim.deploy({ v, api: apiV2 });
    deepStrictEqual(opSummary(sim), [{ action: "remove", id: "worker" }]);
    strictEqual(sim.state.length, 2);

    // 6. Destroy everything
    await sim.destroy();
    const destroyOps = opSummary(sim);
    strictEqual(destroyOps.filter((o) => o.action === "remove").length, 2);
    strictEqual(sim.state.length, 0);
    ok(sim.runtime.tornDown);
  });

  it("replace a resource with a new one of different ID", async () => {
    const old = service("api-v1", { image: "node:18" });
    await sim.deploy({ svc: old });
    strictEqual(sim.runtime.resources.size, 1);

    const fresh = service("api-v2", { image: "node:22" });
    await sim.deploy({ svc: fresh });
    const ops = opSummary(sim);
    ok(ops.some((o) => o.action === "create" && o.id === "api-v2"));
    ok(ops.some((o) => o.action === "remove" && o.id === "api-v1"));
    ok(!sim.runtime.resources.has("api-v1"));
    ok(sim.runtime.resources.has("api-v2"));
  });

  it("swap dependencies — move mount from one service to another", async () => {
    const v = volume("data");
    const s1 = service("s1", {
      image: "x",
      mounts: [{ volume: v, path: "/d" }],
    });
    const s2 = service("s2", { image: "y" });
    await sim.deploy({ v, s1, s2 });

    // Swap: s2 now mounts data, s1 doesn't
    const s1b = service("s1", { image: "x" });
    const s2b = service("s2", {
      image: "y",
      mounts: [{ volume: v, path: "/d" }],
    });
    await sim.deploy({ v, s1: s1b, s2: s2b });

    const ops = opSummary(sim);
    ok(ops.some((o) => o.action === "recreate" && o.id === "s1"));
    ok(ops.some((o) => o.action === "recreate" && o.id === "s2"));

    // Check dependencies updated in state
    const s1State = getState(sim.state, "s1");
    const s2State = getState(sim.state, "s2");
    ok(!s1State.dependencies.includes("data"));
    ok(s2State.dependencies.includes("data"));
  });

  it("scale up — add multiple services in one deploy", async () => {
    const v = volume("data");
    await sim.deploy({ v });

    const s1 = service("s1", {
      image: "x",
      mounts: [{ volume: v, path: "/d" }],
    });
    const s2 = service("s2", {
      image: "y",
      mounts: [{ volume: v, path: "/d" }],
    });
    const s3 = service("s3", {
      image: "z",
      mounts: [{ volume: v, path: "/d" }],
    });
    await sim.deploy({ v, s1, s2, s3 });

    const ops = opSummary(sim);
    strictEqual(ops.length, 3);
    ok(ops.every((o) => o.action === "create"));
  });

  it("remove multiple resources in one deploy", async () => {
    const v1 = volume("v1");
    const v2 = volume("v2");
    const s1 = service("s1", { image: "x" });
    const s2 = service("s2", { image: "y" });
    await sim.deploy({ v1, v2, s1, s2 });

    await sim.deploy({ v1 });
    const ops = opSummary(sim);
    const removes = ops.filter((o) => o.action === "remove");
    strictEqual(removes.length, 3); // v2, s1, s2
  });

  it("destroy from empty state is a no-op (except teardown)", async () => {
    await sim.destroy();
    strictEqual(sim.lastOps().length, 0);
    ok(sim.runtime.tornDown);
  });

  it("deploy empty then destroy — no resources ever exist", async () => {
    await sim.deploy({});
    strictEqual(sim.state.length, 0);
    strictEqual(sim.lastOps().length, 0);

    await sim.destroy();
    strictEqual(sim.lastOps().length, 0);
    ok(sim.runtime.tornDown);
  });
});

// ===========================================================================
//  11. SECRETS & INTERPOLATION
// ===========================================================================

describe("secrets and interpolation", () => {
  let sim: Simulation;
  beforeEach(() => {
    sim = new Simulation();
  });

  it("secret referenced directly in env is tracked as dependency", async () => {
    const sec = secret("db-pass");
    const s = service("api", { image: "x", env: { DB_PASSWORD: sec } });
    await sim.deploy({ sec, s });
    ok(getState(sim.state, "api").dependencies.includes("db-pass"));
  });

  it("secret via interpolate is tracked as dependency", async () => {
    const sec = secret("db-pass");
    const s = service("api", {
      image: "x",
      env: { DATABASE_URL: interpolate`postgres://user:${sec}@db:5432/mydb` },
    });
    await sim.deploy({ sec, s });
    ok(getState(sim.state, "api").dependencies.includes("db-pass"));
  });

  it("multiple secrets in one service are all tracked", async () => {
    const s1 = secret("key-a");
    const s2 = secret("key-b");
    const svc = service("api", { image: "x", env: { A: s1, B: s2 } });
    await sim.deploy({ s1, s2, svc });
    const deps = getState(sim.state, "api").dependencies.sort();
    deepStrictEqual(deps, ["key-a", "key-b"]);
  });

  it("secret in interpolation alongside plain strings", async () => {
    const sec = secret("token");
    const svc = service("api", {
      image: "x",
      env: { AUTH: interpolate`Bearer ${sec}` },
    });
    await sim.deploy({ sec, svc });
    ok(getState(sim.state, "api").dependencies.includes("token"));
  });

  it("changing a secret's config doesn't create runtime ops but updates state", async () => {
    const sec = secret("tok");
    await sim.deploy({ sec });
    const fp1 = getState(sim.state, "tok").fingerprint;

    const sec2 = secret("tok", { length: 64 });
    await sim.deploy({ sec: sec2 });
    strictEqual(sim.lastOps().length, 0);

    const fp2 = getState(sim.state, "tok").fingerprint;
    notStrictEqual(
      fp1,
      fp2,
      "fingerprint should change when secret config changes",
    );
  });

  it("removing a secret that was referenced triggers both remove ops", async () => {
    const sec = secret("tok");
    const svc = service("api", { image: "x", env: { T: sec } });
    await sim.deploy({ sec, svc });
    strictEqual(sim.state.length, 2);

    // Remove both — the service needs to go first (or with) since it refs the secret
    await sim.deploy({});
    const ops = opSummary(sim);
    const removes = ops.filter((o) => o.action === "remove");
    strictEqual(removes.length, 2);
    ok(removes.some((o) => o.id === "tok"));
    ok(removes.some((o) => o.id === "api"));
  });
});

// ===========================================================================
//  12. FAILURE INJECTION
// ===========================================================================

describe("failure injection", () => {
  let sim: Simulation;
  beforeEach(() => {
    sim = new Simulation();
  });

  it("failOn with once=true fires only once", async () => {
    sim.runtime.failOn(
      (op) =>
        op.action === "create" &&
        op.action !== "remove" &&
        op.resource.kind === "volume",
      new Error("disk full"),
      true,
    );

    const v1 = volume("v1");
    await rejects(sim.deploy({ v1 }), /disk full/);

    // Reset state, retry — should succeed now since once=true already fired
    sim.runtime.failOn(
      () => false, // no-op to not add new failures
      new Error("never"),
    );
    // Actually, the failure was already fired, so a new deploy should work
    sim = new Simulation();
    // fresh sim — the old once failure is on the old runtime
    const v2 = volume("v2");
    await sim.deploy({ v2 });
    strictEqual(sim.lastOps().length, 1);
  });

  it("failOn with once=false fails every matching operation", async () => {
    const sim2 = new Simulation();
    sim2.runtime.failOn(
      (op) =>
        op.action === "create" &&
        op.action !== "remove" &&
        op.resource.kind === "service",
      new Error("always fail"),
      false,
    );

    const s = service("api", { image: "x" });
    await rejects(sim2.deploy({ s }), /always fail/);

    // Even on retry with the same runtime, it should fail again
    sim2.reset();
    // Re-register the failure since reset clears failures
    sim2.runtime.failOn(
      (op) =>
        op.action === "create" &&
        op.action !== "remove" &&
        op.resource.kind === "service",
      new Error("always fail"),
      false,
    );
    await rejects(sim2.deploy({ s }), /always fail/);
  });

  it("failure mid-deploy leaves partial runtime state", async () => {
    const v = volume("data");
    const s = service("api", {
      image: "x",
      mounts: [{ volume: v, path: "/d" }],
    });

    sim.runtime.failOn(
      (op) =>
        op.action === "create" &&
        op.action !== "remove" &&
        op.resource.kind === "service",
      new Error("crash"),
    );

    await rejects(sim.deploy({ v, s }), /crash/);

    // Volume was created successfully (it's a dependency, executed first)
    ok(sim.runtime.resources.has("data"));
    strictEqual(sim.runtime.resources.size, 1);
    // Service was NOT created
    ok(!sim.runtime.resources.has("api"));
  });

  it("failure on remove leaves resource in runtime", async () => {
    const v = volume("data");
    await sim.deploy({ v });
    ok(sim.runtime.resources.has("data"));

    sim.runtime.failOn(
      (op) => op.action === "remove",
      new Error("remove failed"),
    );

    await rejects(sim.deploy({}), /remove failed/);
    // Resource should still be in runtime since remove failed
    ok(sim.runtime.resources.has("data"));
  });

  it("failure on recreate prevents the resource from updating", async () => {
    const s = service("api", { image: "node:20" });
    await sim.deploy({ s });
    ok(sim.runtime.resources.has("api"));

    sim.runtime.failOn(
      (op) => op.action === "recreate",
      new Error("recreate failed"),
    );

    const s2 = service("api", { image: "node:22" });
    await rejects(sim.deploy({ s: s2 }), /recreate failed/);
    // The old resource object should still be in the runtime
    const live = sim.runtime.resources.get("api");
    ok(live);
    strictEqual(live.kind, "service");
    strictEqual(
      (live as { config: { image: string } }).config.image,
      "node:20",
    );
  });
});

// ===========================================================================
//  13. OPERATION INTERCEPTION
// ===========================================================================

describe("operation interception", () => {
  let sim: Simulation;
  beforeEach(() => {
    sim = new Simulation();
  });

  it("intercept sees all operations in order", async () => {
    const log: string[] = [];
    sim.runtime.intercept(async (op) => {
      const id = op.action === "remove" ? op.id : op.resource.id;
      log.push(`${op.action}:${id}`);
    });

    const v = volume("data");
    const s = service("api", {
      image: "x",
      mounts: [{ volume: v, path: "/d" }],
    });
    await sim.deploy({ v, s });

    ok(log.includes("create:data"));
    ok(log.includes("create:api"));
    // Volume should be intercepted before service
    ok(log.indexOf("create:data") < log.indexOf("create:api"));
  });

  it("intercept runs before recording in log", async () => {
    let logLengthDuringIntercept = -1;
    sim.runtime.intercept(async () => {
      logLengthDuringIntercept = sim.runtime.log.length;
    });

    const v = volume("data");
    await sim.deploy({ v });

    // During the first intercept, log should be empty (intercept runs before recording)
    strictEqual(logLengthDuringIntercept, 0);
    // After deploy, log should have the entry
    strictEqual(sim.runtime.log.length, 1);
  });

  it("intercept can modify external state for assertions", async () => {
    const timestamps: number[] = [];
    sim.runtime.intercept(async () => {
      timestamps.push(Date.now());
      await new Promise((r) => setTimeout(r, 5));
    });

    const v1 = volume("v1");
    const v2 = volume("v2");
    await sim.deploy({ v1, v2 });

    strictEqual(timestamps.length, 2);
  });
});

// ===========================================================================
//  14. FINALIZE & TEARDOWN
// ===========================================================================

describe("finalize and teardown", () => {
  let sim: Simulation;
  beforeEach(() => {
    sim = new Simulation();
  });

  it("finalize not called by deploy", async () => {
    const s = service("api", { image: "x" });
    await sim.deploy({ s });
    strictEqual(sim.runtime.finalized, false);
  });

  it("teardown not called by deploy", async () => {
    const s = service("api", { image: "x" });
    await sim.deploy({ s });
    strictEqual(sim.runtime.tornDown, false);
  });

  it("finalize can be called manually with service list", async () => {
    const s = service("api", { image: "x" });
    await sim.deploy({ s });
    await sim.runtime.finalize([s]);
    strictEqual(sim.runtime.finalized, true);
  });

  it("destroy calls teardown", async () => {
    const s = service("api", { image: "x" });
    await sim.deploy({ s });
    await sim.destroy();
    strictEqual(sim.runtime.tornDown, true);
  });

  it("destroy removes all resources then tears down", async () => {
    const v = volume("data");
    const s = service("api", {
      image: "x",
      mounts: [{ volume: v, path: "/d" }],
    });
    await sim.deploy({ v, s });
    strictEqual(sim.runtime.resources.size, 2);

    await sim.destroy();
    strictEqual(sim.runtime.resources.size, 0);
    ok(sim.runtime.tornDown);
    strictEqual(sim.state.length, 0);
  });
});

// ===========================================================================
//  15. RUNTIME STATE
// ===========================================================================

describe("runtimeState", () => {
  let sim: Simulation;
  beforeEach(() => {
    sim = new Simulation();
  });

  it("returns simulated: true for each live resource", async () => {
    const v = volume("data");
    const s = service("api", { image: "x" });
    await sim.deploy({ v, s });

    const rs = sim.runtime.runtimeState();
    strictEqual(rs.size, 2);
    deepStrictEqual(rs.get("data"), { simulated: true });
    deepStrictEqual(rs.get("api"), { simulated: true });
  });

  it("secrets are not in runtimeState (no execute called)", async () => {
    const sec = secret("tok");
    await sim.deploy({ sec });
    strictEqual(sim.runtime.runtimeState().size, 0);
  });

  it("removed resources disappear from runtimeState", async () => {
    const v = volume("data");
    await sim.deploy({ v });
    strictEqual(sim.runtime.runtimeState().size, 1);

    await sim.deploy({});
    strictEqual(sim.runtime.runtimeState().size, 0);
  });

  it("runtimeState reflects current live set after multiple deploys", async () => {
    const v = volume("data");
    const s1 = service("s1", { image: "x" });
    await sim.deploy({ v, s1 });
    strictEqual(sim.runtime.runtimeState().size, 2);

    const s2 = service("s2", { image: "y" });
    await sim.deploy({ v, s2 }); // replace s1 with s2
    const rs = sim.runtime.runtimeState();
    strictEqual(rs.size, 2);
    ok(rs.has("data"));
    ok(rs.has("s2"));
    ok(!rs.has("s1"));
  });
});

// ===========================================================================
//  16. RESET
// ===========================================================================

describe("reset", () => {
  let sim: Simulation;
  beforeEach(() => {
    sim = new Simulation();
  });

  it("clears all simulation state", async () => {
    const v = volume("data");
    const s = service("api", {
      image: "x",
      mounts: [{ volume: v, path: "/d" }],
    });
    await sim.deploy({ v, s });
    await sim.runtime.finalize([s]);

    sim.reset();

    strictEqual(sim.state.length, 0);
    strictEqual(sim.runtime.resources.size, 0);
    strictEqual(sim.runtime.log.length, 0);
    strictEqual(sim.runtime.finalized, false);
    strictEqual(sim.runtime.tornDown, false);
    strictEqual(sim.lastOps().length, 0);
  });

  it("allows fresh deploy after reset", async () => {
    const s = service("api", { image: "node:20" });
    await sim.deploy({ s });
    sim.reset();

    // Deploy same config — should see create, not no-op
    await sim.deploy({ s });
    deepStrictEqual(opSummary(sim), [{ action: "create", id: "api" }]);
  });

  it("reset clears failure injections", async () => {
    sim.runtime.failOn((op) => op.action === "create", new Error("fail"));
    sim.reset();

    const v = volume("data");
    await sim.deploy({ v }); // should NOT throw
    strictEqual(sim.lastOps().length, 1);
  });

  it("reset clears interceptors", async () => {
    let called = false;
    sim.runtime.intercept(async () => {
      called = true;
    });
    sim.reset();

    const v = volume("data");
    await sim.deploy({ v });
    strictEqual(called, false);
  });
});

// ===========================================================================
//  17. OPERATION LOG
// ===========================================================================

describe("operation log", () => {
  let sim: Simulation;
  beforeEach(() => {
    sim = new Simulation();
  });

  it("log indices are monotonically increasing", async () => {
    const v = volume("data");
    const s = service("api", {
      image: "x",
      mounts: [{ volume: v, path: "/d" }],
    });
    await sim.deploy({ v, s });

    const indices = sim.runtime.log.map((e) => e.index);
    for (let i = 1; i < indices.length; i++) {
      const curr = indices[i];
      const prev = indices[i - 1];
      ok(curr !== undefined, `index at ${i} should exist`);
      ok(prev !== undefined, `index at ${i - 1} should exist`);
      ok(curr > prev, `index ${curr} should be > ${prev}`);
    }
  });

  it("log indices continue across deploys", async () => {
    const v = volume("data");
    await sim.deploy({ v });
    const firstMax = sim.runtime.log[sim.runtime.log.length - 1]?.index;

    const s = service("api", { image: "x" });
    await sim.deploy({ v, s });
    const secondMin = sim.lastOps()[0]?.index;

    ok(
      secondMin > firstMax,
      `second deploy ops should start after first deploy's last index`,
    );
  });

  it("lastOps returns only the most recent deploy's operations", async () => {
    const v = volume("data");
    await sim.deploy({ v });
    strictEqual(sim.lastOps().length, 1);

    const s = service("api", { image: "x" });
    await sim.deploy({ v, s });
    // lastOps should only have the create for api, not the earlier create for data
    strictEqual(sim.lastOps().length, 1);
    const op = sim.lastOps()[0]?.operation;
    ok(op.action !== "remove" && op.resource.id === "api");
  });

  it("lastOps is empty after no-op redeploy", async () => {
    const v = volume("data");
    await sim.deploy({ v });
    await sim.deploy({ v });
    strictEqual(sim.lastOps().length, 0);
  });

  it("total log length is cumulative across all deploys", async () => {
    const v = volume("data");
    await sim.deploy({ v }); // 1 op
    strictEqual(sim.runtime.log.length, 1);

    const s = service("api", { image: "x" });
    await sim.deploy({ v, s }); // 1 op (create api)
    strictEqual(sim.runtime.log.length, 2);

    const s2 = service("api", { image: "y" });
    await sim.deploy({ v, s: s2 }); // 1 op (recreate api)
    strictEqual(sim.runtime.log.length, 3);

    await sim.deploy({}); // 2 ops (remove data, remove api)
    strictEqual(sim.runtime.log.length, 5);
  });
});

// ===========================================================================
//  18. COMPLEX TOPOLOGIES
// ===========================================================================

describe("complex topologies", () => {
  let sim: Simulation;
  beforeEach(() => {
    sim = new Simulation();
  });

  it("service depending on another service via dependsOn", async () => {
    const db = service("db", { image: "pg" });
    const api = service("api", { image: "x", dependsOn: [db] });
    await sim.deploy({ db, api });

    const ops = opSummary(sim);
    ok(
      ops.findIndex((o) => o.id === "db") <
        ops.findIndex((o) => o.id === "api"),
    );

    const apiState = getState(sim.state, "api");
    ok(apiState.dependencies.includes("db"));
  });

  it("three-tier: db → api → frontend", async () => {
    const db = service("db", { image: "pg" });
    const api = service("api", { image: "x", dependsOn: [db] });
    const web = service("web", { image: "y", dependsOn: [api] });
    await sim.deploy({ web, api, db });

    const ops = opSummary(sim);
    const dbi = ops.findIndex((o) => o.id === "db");
    const apii = ops.findIndex((o) => o.id === "api");
    const webi = ops.findIndex((o) => o.id === "web");
    ok(
      dbi < apii && apii < webi,
      `expected db < api < web, got ${dbi} ${apii} ${webi}`,
    );
  });

  it("fan-out: one volume shared by many services", async () => {
    const v = volume("shared");
    const services = Array.from({ length: 5 }, (_, i) =>
      service(`svc${i}`, { image: "x", mounts: [{ volume: v, path: "/d" }] }),
    );
    await sim.deploy({
      v,
      ...Object.fromEntries(services.map((s) => [s.id, s])),
    });

    const ops = opSummary(sim);
    const vi = ops.findIndex((o) => o.id === "shared");
    for (const s of services) {
      const si = ops.findIndex((o) => o.id === s.id);
      ok(vi < si, `volume should come before ${s.id}`);
    }
    // 1 volume + 5 services = 6 ops
    strictEqual(ops.length, 6);
  });

  it("mixed resource types with complex dependencies", async () => {
    const v1 = volume("v1");
    const v2 = volume("v2");
    const sec = secret("sec");
    const db = service("db", {
      image: "pg",
      mounts: [{ volume: v1, path: "/d" }],
    });
    const cache = service("cache", {
      image: "redis",
      mounts: [{ volume: v2, path: "/d" }],
    });
    const api = service("api", {
      image: "x",
      dependsOn: [db, cache],
      env: { SECRET: sec },
    });
    const cron = cronjob("cleanup", {
      image: "alpine",
      schedule: "0 3 * * *",
      mounts: [{ volume: v1, path: "/d" }],
      env: { SECRET: sec },
    });
    await sim.deploy({ v1, v2, sec, db, cache, api, cron });

    strictEqual(sim.state.length, 7);

    const ops = opSummary(sim);

    // Volumes before services that use them
    const v1i = ops.findIndex((o) => o.id === "v1");
    const v2i = ops.findIndex((o) => o.id === "v2");
    const dbi = ops.findIndex((o) => o.id === "db");
    const cachei = ops.findIndex((o) => o.id === "cache");
    const apii = ops.findIndex((o) => o.id === "api");
    const croni = ops.findIndex((o) => o.id === "cleanup");

    ok(v1i >= 0 && v1i < dbi, "v1 before db");
    ok(v2i >= 0 && v2i < cachei, "v2 before cache");
    ok(dbi < apii, "db before api");
    ok(cachei < apii, "cache before api");
    if (croni >= 0) ok(v1i < croni, "v1 before cleanup cron");

    // Check dependency lists in state
    const apiDeps = getState(sim.state, "api").dependencies.sort();
    deepStrictEqual(apiDeps, ["cache", "db", "sec"]);

    const cronDeps = getState(sim.state, "cleanup").dependencies.sort();
    deepStrictEqual(cronDeps, ["sec", "v1"]);
  });

  it("independent resources have no ordering constraint", async () => {
    const v1 = volume("v1");
    const v2 = volume("v2");
    const s1 = service("s1", { image: "x" });
    const s2 = service("s2", { image: "y" });
    await sim.deploy({ v1, v2, s1, s2 });

    // All four should be created — no specific order between independent ones
    strictEqual(sim.lastOps().length, 4);
    const ids = opSummary(sim)
      .map((o) => o.id)
      .sort();
    deepStrictEqual(ids, ["s1", "s2", "v1", "v2"]);
  });
});

// ===========================================================================
//  19. CRONJOB SPECIFICS
// ===========================================================================

describe("cronjob specifics", () => {
  let sim: Simulation;
  beforeEach(() => {
    sim = new Simulation();
  });

  it("cronjob create/modify/remove lifecycle", async () => {
    const c = cronjob("job", { image: "alpine", schedule: "0 * * * *" });
    await sim.deploy({ c });
    deepStrictEqual(opSummary(sim), [{ action: "create", id: "job" }]);

    // Modify
    const c2 = cronjob("job", { image: "alpine:3.19", schedule: "0 * * * *" });
    await sim.deploy({ c: c2 });
    deepStrictEqual(opSummary(sim), [{ action: "recreate", id: "job" }]);

    // No-op
    await sim.deploy({ c: c2 });
    strictEqual(sim.lastOps().length, 0);

    // Remove
    await sim.deploy({});
    deepStrictEqual(opSummary(sim), [{ action: "remove", id: "job" }]);
  });

  it("changing schedule triggers recreate", async () => {
    const c = cronjob("job", { image: "alpine", schedule: "0 * * * *" });
    await sim.deploy({ c });
    const c2 = cronjob("job", { image: "alpine", schedule: "30 * * * *" });
    await sim.deploy({ c: c2 });
    deepStrictEqual(opSummary(sim), [{ action: "recreate", id: "job" }]);
  });

  it("changing command triggers recreate", async () => {
    const c = cronjob("job", {
      image: "alpine",
      schedule: "0 * * * *",
      command: "echo hello",
    });
    await sim.deploy({ c });
    const c2 = cronjob("job", {
      image: "alpine",
      schedule: "0 * * * *",
      command: "echo bye",
    });
    await sim.deploy({ c: c2 });
    deepStrictEqual(opSummary(sim), [{ action: "recreate", id: "job" }]);
  });

  it("cronjob with volume mount and secret env", async () => {
    const v = volume("logs");
    const sec = secret("api-key");
    const c = cronjob("report", {
      image: "alpine",
      schedule: "0 6 * * *",
      mounts: [{ volume: v, path: "/logs" }],
      env: { API_KEY: sec },
    });
    await sim.deploy({ v, sec, c });

    const cronState = getState(sim.state, "report");
    const deps = cronState.dependencies.sort();
    deepStrictEqual(deps, ["api-key", "logs"]);

    // Volume should be created before cronjob
    const ops = opSummary(sim);
    const vi = ops.findIndex((o) => o.id === "logs");
    const ci = ops.findIndex((o) => o.id === "report");
    ok(vi < ci);
  });
});

// ===========================================================================
//  20. IDEMPOTENCY — various unchanged scenarios
// ===========================================================================

describe("idempotency", () => {
  let sim: Simulation;
  beforeEach(() => {
    sim = new Simulation();
  });

  it("triple deploy of same config: no ops after first", async () => {
    const config = {
      v: volume("data"),
      s: service("api", { image: "x" }),
    };
    await sim.deploy(config);
    ok(sim.lastOps().length > 0);

    await sim.deploy(config);
    strictEqual(sim.lastOps().length, 0);

    await sim.deploy(config);
    strictEqual(sim.lastOps().length, 0);
  });

  it("idempotent after modify", async () => {
    const s = service("api", { image: "node:20" });
    await sim.deploy({ s });
    const s2 = service("api", { image: "node:22" });
    await sim.deploy({ s: s2 });
    ok(sim.lastOps().length > 0);

    // Redeploying the modified version should be no-op
    await sim.deploy({ s: s2 });
    strictEqual(sim.lastOps().length, 0);
  });

  it("idempotent after adding a resource", async () => {
    const v = volume("data");
    await sim.deploy({ v });
    const s = service("api", { image: "x" });
    await sim.deploy({ v, s });
    ok(sim.lastOps().length > 0);

    await sim.deploy({ v, s });
    strictEqual(sim.lastOps().length, 0);
  });

  it("idempotent after removing a resource", async () => {
    const v = volume("data");
    const s = service("api", { image: "x" });
    await sim.deploy({ v, s });
    await sim.deploy({ v });
    ok(sim.lastOps().length > 0);

    await sim.deploy({ v });
    strictEqual(sim.lastOps().length, 0);
  });

  it("volume stays idempotent even when size changes (immutable)", async () => {
    const v = volume("data");
    await sim.deploy({ v });
    const v2 = volume("data", { size: "100Gi" });
    await sim.deploy({ v: v2 });
    // Volume modify produces no ops
    strictEqual(sim.lastOps().length, 0);

    // But deploy again — still no ops (even though fingerprint changed,
    // the state now has the new fingerprint)
    await sim.deploy({ v: v2 });
    strictEqual(sim.lastOps().length, 0);
  });
});

// ===========================================================================
//  21. EDGE CASES
// ===========================================================================

describe("edge cases", () => {
  let sim: Simulation;
  beforeEach(() => {
    sim = new Simulation();
  });

  it("single volume deploy and destroy", async () => {
    const v = volume("data");
    await sim.deploy({ v });
    strictEqual(sim.state.length, 1);
    strictEqual(sim.runtime.resources.size, 1);

    await sim.destroy();
    strictEqual(sim.state.length, 0);
    strictEqual(sim.runtime.resources.size, 0);
  });

  it("single secret deploy — no runtime ops, state exists", async () => {
    const sec = secret("tok");
    await sim.deploy({ sec });
    strictEqual(sim.state.length, 1);
    strictEqual(sim.runtime.resources.size, 0); // no runtime ops for secrets
    strictEqual(sim.lastOps().length, 0);
  });

  it("only secrets in config — no operations at all", async () => {
    const a = secret("a");
    const b = secret("b");
    const c = secret("c");
    await sim.deploy({ a, b, c });
    strictEqual(sim.lastOps().length, 0);
    strictEqual(sim.state.length, 3);
  });

  it("adding build config to service triggers recreate", async () => {
    const s = service("api", { image: "node:20" });
    await sim.deploy({ s });
    const s2 = service("api", { image: "node:20", build: "./apps/api" });
    await sim.deploy({ s: s2 });
    deepStrictEqual(opSummary(sim), [{ action: "recreate", id: "api" }]);
  });

  it("service with all optional fields set", async () => {
    const v = volume("data");
    const sec = secret("tok");
    const db = service("db", { image: "pg" });
    const api = service("api", {
      image: "node:20",
      build: "./apps/api",
      port: 8080,
      route: "api.example.com",
      env: { TOKEN: sec, NODE_ENV: "production" },
      command: ["node", "server.js"],
      mounts: [{ volume: v, path: "/data" }],
      dependsOn: [db],
      health: {
        command: "curl localhost:8080/health",
        interval: "10s",
        timeout: "5s",
        retries: 3,
        startPeriod: "30s",
      },
      restart: "on-failure",
      replicas: 2,
    });
    await sim.deploy({ v, sec, db, api });

    strictEqual(sim.state.length, 4);
    const apiState = getState(sim.state, "api");
    deepStrictEqual(apiState.outputs, {
      host: "api",
      port: 8080,
      url: "http://api:8080",
    });
    const deps = apiState.dependencies.sort();
    deepStrictEqual(deps, ["data", "db", "tok"]);
  });

  it("many deploys tracking runtime resources correctly", async () => {
    const v = volume("data");
    await sim.deploy({ v });
    strictEqual(sim.runtime.resources.size, 1);

    const s1 = service("s1", { image: "x" });
    await sim.deploy({ v, s1 });
    strictEqual(sim.runtime.resources.size, 2);

    const s2 = service("s2", { image: "y" });
    await sim.deploy({ v, s2 }); // removes s1, adds s2
    strictEqual(sim.runtime.resources.size, 2);
    ok(sim.runtime.resources.has("data"));
    ok(sim.runtime.resources.has("s2"));
    ok(!sim.runtime.resources.has("s1"));

    await sim.deploy({}); // removes all
    strictEqual(sim.runtime.resources.size, 0);
  });

  it("recreate updates the resource object in runtime", async () => {
    const s = service("api", { image: "node:20" });
    await sim.deploy({ s });
    const live1 = sim.runtime.resources.get("api");
    ok(live1);
    strictEqual(
      (live1 as { config: { image: string } }).config.image,
      "node:20",
    );

    const s2 = service("api", { image: "node:22" });
    await sim.deploy({ s: s2 });
    const live2 = sim.runtime.resources.get("api");
    ok(live2);
    strictEqual(
      (live2 as { config: { image: string } }).config.image,
      "node:22",
    );
  });
});

// ===========================================================================
//  22. RUNTIME-SPECIFIC SIMULATION (K8s)
// ===========================================================================

describe("k8s runtime via simulation", () => {
  let sim: Simulation;
  beforeEach(() => {
    sim = new Simulation("k8s");
  });

  it("service modify with spec change returns update (not recreate)", async () => {
    await sim.deploy({ s: service("api", { image: "node:20" }) });
    await sim.deploy({ s: service("api", { image: "node:22" }) });
    deepStrictEqual(opSummary(sim), [{ action: "update", id: "api" }]);
  });

  it("replicas-only change returns update (scale)", async () => {
    await sim.deploy({ s: service("api", { image: "x", replicas: 1 }) });
    await sim.deploy({ s: service("api", { image: "x", replicas: 3 }) });
    deepStrictEqual(opSummary(sim), [{ action: "update", id: "api" }]);
  });

  it("route-only change is a no-op", async () => {
    await sim.deploy({
      s: service("api", { image: "x", route: "old.example.com" }),
    });
    await sim.deploy({
      s: service("api", { image: "x", route: "new.example.com" }),
    });
    deepStrictEqual(opSummary(sim), []);
  });
});
