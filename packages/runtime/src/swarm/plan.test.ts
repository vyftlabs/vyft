import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { Change, Service } from "@vyft/core";
import { INTERNAL, MOUNTABLE } from "@vyft/core";
import { createSwarmRuntime } from "./index.ts";

function svc(
  id: string,
  config: Service["config"] = { image: "test" },
): Service {
  const port = config.port ?? 3000;
  return {
    kind: "service",
    id,
    config,
    host: id,
    port,
    url: `http://${id}:${port}`,
    [INTERNAL]: { ready: async () => {} },
  };
}

const opts = {
  project: "test",
  stage: "local",
  secrets: new Map<string, string>(),
};

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
    const change: Change = {
      status: "modify",
      resource: svc("api"),
      previous: { image: "old" },
    };
    const ops = runtime.plan(change);
    strictEqual(ops.length, 1);
    strictEqual(ops[0]?.action, "update");
  });

  it("returns update for service modify with replicas-only change (scale)", () => {
    const runtime = createSwarmRuntime(opts);
    const change: Change = {
      status: "modify",
      resource: svc("api", { image: "test", replicas: 3 }),
      previous: { image: "test", replicas: 1 },
    };
    const ops = runtime.plan(change);
    strictEqual(ops.length, 1);
    strictEqual(ops[0]?.action, "update");
  });

  it("returns empty for service modify with route-only change", () => {
    const runtime = createSwarmRuntime(opts);
    const change: Change = {
      status: "modify",
      resource: svc("api", { image: "test", route: "new.example.com" }),
      previous: { image: "test", route: "old.example.com" },
    };
    deepStrictEqual(runtime.plan(change), []);
  });

  it("returns create for service create", () => {
    const runtime = createSwarmRuntime(opts);
    const change: Change = { status: "create", resource: svc("api") };
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
