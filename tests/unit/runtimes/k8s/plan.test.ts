import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { Change } from "../../../../src/engine/plan.ts";
import { createK8sRuntime } from "../../../../src/runtimes/k8s/index.ts";

const opts = { project: "test", secrets: new Map<string, string>() };

describe("K8s runtime plan()", () => {
  it("returns empty for secret create", () => {
    const runtime = createK8sRuntime(opts);
    const change: Change = {
      status: "create",
      resource: { kind: "secret", id: "s", config: {} },
    };
    deepStrictEqual(runtime.plan(change), []);
  });

  it("returns empty for secret modify", () => {
    const runtime = createK8sRuntime(opts);
    const change: Change = {
      status: "modify",
      resource: { kind: "secret", id: "s", config: {} },
    };
    deepStrictEqual(runtime.plan(change), []);
  });

  it("returns empty for volume modify", () => {
    const runtime = createK8sRuntime(opts);
    const change: Change = {
      status: "modify",
      resource: { kind: "volume", id: "v", config: {} },
    };
    deepStrictEqual(runtime.plan(change), []);
  });

  it("returns update for service modify with spec change", () => {
    const runtime = createK8sRuntime(opts);
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

  it("returns update for service modify without previous (fallback)", () => {
    const runtime = createK8sRuntime(opts);
    const svc = {
      kind: "service" as const,
      id: "api",
      config: { image: "test" },
      host: "api",
      port: 3000,
      url: "http://api:3000",
    };
    const change: Change = { status: "modify", resource: svc };
    const ops = runtime.plan(change);
    strictEqual(ops.length, 1);
    strictEqual(ops[0]?.action, "update");
  });

  it("returns empty for service modify with route-only change", () => {
    const runtime = createK8sRuntime(opts);
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

  it("returns update for service modify with replicas-only change (scale)", () => {
    const runtime = createK8sRuntime(opts);
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

  it("returns empty for service modify with dev-only change", () => {
    const runtime = createK8sRuntime(opts);
    const svc = {
      kind: "service" as const,
      id: "api",
      config: { image: "test", dev: { command: "npm run dev" } },
      host: "api",
      port: 3000,
      url: "http://api:3000",
    };
    const change: Change = {
      status: "modify",
      resource: svc,
      previous: { image: "test" },
    };
    deepStrictEqual(runtime.plan(change), []);
  });

  it("returns create for service create", () => {
    const runtime = createK8sRuntime(opts);
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

  it("returns update for cronjob modify with spec change", () => {
    const runtime = createK8sRuntime(opts);
    const cj = {
      kind: "cronjob" as const,
      id: "job",
      config: { schedule: "0 * * * *", image: "test" },
    };
    const change: Change = {
      status: "modify",
      resource: cj,
      previous: { schedule: "0 * * * *", image: "old" },
    };
    const ops = runtime.plan(change);
    strictEqual(ops.length, 1);
    strictEqual(ops[0]?.action, "update");
  });

  it("returns update for cronjob modify without previous (fallback)", () => {
    const runtime = createK8sRuntime(opts);
    const cj = {
      kind: "cronjob" as const,
      id: "job",
      config: { schedule: "0 * * * *", image: "test" },
    };
    const change: Change = { status: "modify", resource: cj };
    const ops = runtime.plan(change);
    strictEqual(ops.length, 1);
    strictEqual(ops[0]?.action, "update");
  });

  it("returns create for cronjob create", () => {
    const runtime = createK8sRuntime(opts);
    const cj = {
      kind: "cronjob" as const,
      id: "job",
      config: { schedule: "0 * * * *", image: "test" },
    };
    const change: Change = { status: "create", resource: cj };
    const ops = runtime.plan(change);
    strictEqual(ops.length, 1);
    strictEqual(ops[0]?.action, "create");
  });

  it("returns remove for any resource kind", () => {
    const runtime = createK8sRuntime(opts);
    for (const kind of ["volume", "secret", "service", "cronjob"] as const) {
      const change: Change = { status: "remove", id: "x", kind };
      const ops = runtime.plan(change);
      strictEqual(ops.length, 1);
      strictEqual(ops[0]?.action, "remove");
    }
  });
});
