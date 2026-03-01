import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { Change } from "@vyft/core";
import { defaultPlan } from "../simulation.ts";

describe("defaultPlan", () => {
  it("remove change returns remove operation", () => {
    const change: Change = { status: "remove", id: "x", kind: "service" };
    deepStrictEqual(defaultPlan(change), [
      { action: "remove", id: "x", kind: "service" },
    ]);
  });

  it("secret change returns empty", () => {
    const change: Change = {
      status: "create",
      resource: { kind: "config", id: "s", config: {} },
    };
    deepStrictEqual(defaultPlan(change), []);
  });

  it("volume modify returns empty", () => {
    const change: Change = {
      status: "modify",
      resource: { kind: "volume", id: "v", config: {} },
    };
    deepStrictEqual(defaultPlan(change), []);
  });

  it("volume modify with previous returns empty (immutability check fires first)", () => {
    const change: Change = {
      status: "modify",
      resource: { kind: "volume", id: "v", config: {} },
      previous: {},
    };
    deepStrictEqual(defaultPlan(change), []);
  });

  it("service modify with previous and spec change returns recreate", () => {
    const svc = {
      kind: "service" as const,
      id: "api",
      config: { image: "new" },
      host: "api",
      port: 3000,
      url: "http://api:3000",
    };
    const change: Change = {
      status: "modify",
      resource: svc,
      previous: { image: "old" },
    };
    deepStrictEqual(defaultPlan(change), [
      { action: "recreate", resource: svc },
    ]);
  });

  it("service modify with previous and only non-spec changes returns empty", () => {
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
    deepStrictEqual(defaultPlan(change), []);
  });

  it("service modify with previous and dev-only change returns empty", () => {
    const svc = {
      kind: "service" as const,
      id: "api",
      config: { image: "test", dev: { command: "npm dev" } },
      host: "api",
      port: 3000,
      url: "http://api:3000",
    };
    const change: Change = {
      status: "modify",
      resource: svc,
      previous: { image: "test" },
    };
    deepStrictEqual(defaultPlan(change), []);
  });

  it("service modify without previous returns recreate (fallback)", () => {
    const svc = {
      kind: "service" as const,
      id: "api",
      config: { image: "test" },
      host: "api",
      port: 3000,
      url: "http://api:3000",
    };
    const change: Change = { status: "modify", resource: svc };
    deepStrictEqual(defaultPlan(change), [
      { action: "recreate", resource: svc },
    ]);
  });

  it("cronjob modify with previous and spec change returns recreate", () => {
    const cj = {
      kind: "cronjob" as const,
      id: "job",
      config: { schedule: "0 * * * *", image: "new" },
    };
    const change: Change = {
      status: "modify",
      resource: cj,
      previous: { schedule: "0 * * * *", image: "old" },
    };
    deepStrictEqual(defaultPlan(change), [
      { action: "recreate", resource: cj },
    ]);
  });

  it("cronjob modify without previous returns recreate (fallback)", () => {
    const cj = {
      kind: "cronjob" as const,
      id: "job",
      config: { schedule: "0 * * * *", image: "test" },
    };
    const change: Change = { status: "modify", resource: cj };
    deepStrictEqual(defaultPlan(change), [
      { action: "recreate", resource: cj },
    ]);
  });

  it("service create returns create", () => {
    const svc = {
      kind: "service" as const,
      id: "api",
      config: { image: "test" },
      host: "api",
      port: 3000,
      url: "http://api:3000",
    };
    const change: Change = { status: "create", resource: svc };
    deepStrictEqual(defaultPlan(change), [{ action: "create", resource: svc }]);
  });

  it("volume create returns create", () => {
    const change: Change = {
      status: "create",
      resource: { kind: "volume", id: "v", config: {} },
    };
    deepStrictEqual(defaultPlan(change), [
      { action: "create", resource: { kind: "volume", id: "v", config: {} } },
    ]);
  });
});
