import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { Change } from "@vyft/core";
import { MOUNTABLE } from "@vyft/core";
import { createSwarmRuntime } from "./index.ts";

const opts = { project: "test", secrets: new Map<string, string>() };

describe("Swarm runtime plan()", () => {
  it("returns empty for config create", () => {
    const runtime = createSwarmRuntime(opts);
    const change: Change = {
      status: "create",
      resource: { kind: "config", id: "s", config: {} },
    };
    deepStrictEqual(runtime.plan(change), []);
  });

  it("returns empty for volume modify", () => {
    const runtime = createSwarmRuntime(opts);
    const change: Change = {
      status: "modify",
      resource: { kind: "volume", id: "v", config: {}, [MOUNTABLE]: true },
    };
    deepStrictEqual(runtime.plan(change), []);
  });

  it("returns update for service modify with spec change", () => {
    const runtime = createSwarmRuntime(opts);
    const svc = {
      kind: "service" as const,
      id: "api",
      config: { image: "test" },
      host: "api",
      port: 3000,
      url: "http://api:3000",
    };
    const change: Change = {
      status: "modify",
      resource: svc,
      previous: { image: "old" },
    };
    const ops = runtime.plan(change);
    strictEqual(ops.length, 1);
    strictEqual(ops[0]?.action, "update");
  });

  it("returns update for service modify with replicas-only change (scale)", () => {
    const runtime = createSwarmRuntime(opts);
    const svc = {
      kind: "service" as const,
      id: "api",
      config: { image: "test", replicas: 3 },
      host: "api",
      port: 3000,
      url: "http://api:3000",
    };
    const change: Change = {
      status: "modify",
      resource: svc,
      previous: { image: "test", replicas: 1 },
    };
    const ops = runtime.plan(change);
    strictEqual(ops.length, 1);
    strictEqual(ops[0]?.action, "update");
  });

  it("returns empty for service modify with route-only change", () => {
    const runtime = createSwarmRuntime(opts);
    const svc = {
      kind: "service" as const,
      id: "api",
      config: { image: "test", route: "new.example.com" },
      host: "api",
      port: 3000,
      url: "http://api:3000",
    };
    const change: Change = {
      status: "modify",
      resource: svc,
      previous: { image: "test", route: "old.example.com" },
    };
    deepStrictEqual(runtime.plan(change), []);
  });

  it("returns create for service create", () => {
    const runtime = createSwarmRuntime(opts);
    const svc = {
      kind: "service" as const,
      id: "api",
      config: { image: "test" },
      host: "api",
      port: 3000,
      url: "http://api:3000",
    };
    const change: Change = { status: "create", resource: svc };
    const ops = runtime.plan(change);
    strictEqual(ops.length, 1);
    strictEqual(ops[0]?.action, "create");
  });

  it("returns remove for any resource kind", () => {
    const runtime = createSwarmRuntime(opts);
    for (const kind of ["volume", "config", "service", "cronjob"] as const) {
      const change: Change = { status: "remove", id: "x", kind };
      const ops = runtime.plan(change);
      strictEqual(ops.length, 1);
      strictEqual(ops[0]?.action, "remove");
    }
  });
});
