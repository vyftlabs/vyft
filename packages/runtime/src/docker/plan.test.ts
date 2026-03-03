import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { Change } from "@vyft/core";
import { MOUNTABLE } from "@vyft/core";
import { createDockerRuntime } from "./index.ts";

const opts = {
  project: "test",
  stage: "local",
  secrets: new Map<string, string>(),
};

describe("Docker runtime plan()", () => {
  it("returns empty for config create", () => {
    const runtime = createDockerRuntime(opts);
    const change: Change = {
      status: "create",
      resource: { kind: "config", id: "s", config: {} },
    };
    deepStrictEqual(runtime.plan(change), []);
  });

  it("returns empty for config modify", () => {
    const runtime = createDockerRuntime(opts);
    const change: Change = {
      status: "modify",
      resource: { kind: "config", id: "s", config: {} },
    };
    deepStrictEqual(runtime.plan(change), []);
  });

  it("returns create for volume create", () => {
    const runtime = createDockerRuntime(opts);
    const change: Change = {
      status: "create",
      resource: { kind: "volume", id: "v", config: {}, [MOUNTABLE]: true },
    };
    const ops = runtime.plan(change);
    strictEqual(ops.length, 1);
    strictEqual(ops[0]?.action, "create");
  });

  it("returns empty for volume modify (immutable)", () => {
    const runtime = createDockerRuntime(opts);
    const change: Change = {
      status: "modify",
      resource: { kind: "volume", id: "v", config: {}, [MOUNTABLE]: true },
    };
    deepStrictEqual(runtime.plan(change), []);
  });

  it("returns recreate for service modify with spec change", () => {
    const runtime = createDockerRuntime(opts);
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
    strictEqual(ops[0]?.action, "recreate");
  });

  it("returns recreate for service modify without previous (fallback)", () => {
    const runtime = createDockerRuntime(opts);
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
    strictEqual(ops[0]?.action, "recreate");
  });

  it("returns empty for service modify with route-only change", () => {
    const runtime = createDockerRuntime(opts);
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

  it("returns empty for service modify with replicas-only change", () => {
    const runtime = createDockerRuntime(opts);
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
    deepStrictEqual(runtime.plan(change), []);
  });

  it("returns create for service create", () => {
    const runtime = createDockerRuntime(opts);
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

  it("returns recreate for cronjob modify with spec change", () => {
    const runtime = createDockerRuntime(opts);
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
    strictEqual(ops[0]?.action, "recreate");
  });

  it("returns create for cronjob create", () => {
    const runtime = createDockerRuntime(opts);
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
    const runtime = createDockerRuntime(opts);
    for (const kind of ["volume", "config", "service", "cronjob"] as const) {
      const change: Change = { status: "remove", id: "x", kind };
      const ops = runtime.plan(change);
      strictEqual(ops.length, 1);
      strictEqual(ops[0]?.action, "remove");
    }
  });
});
