import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { Change, Service } from "@vyft/core";
import { buildURN, INTERNAL, MOUNTABLE } from "@vyft/core";
import { defaultPlan } from "../simulation.ts";

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

describe("defaultPlan", () => {
  it("remove change returns remove operation", () => {
    const urn = buildURN("runtime", "default", "service", "x");
    const change: Change = { status: "remove", urn };
    deepStrictEqual(defaultPlan(change), [
      { action: "remove", urn, id: "x", kind: "service" },
    ]);
  });

  it("secret change returns empty", () => {
    const change: Change = {
      status: "create",
      resource: { kind: "variable", id: "s", config: {} },
    };
    deepStrictEqual(defaultPlan(change), []);
  });

  it("volume modify returns empty", () => {
    const change: Change = {
      status: "modify",
      resource: { kind: "volume", id: "v", config: {}, [MOUNTABLE]: true },
    };
    deepStrictEqual(defaultPlan(change), []);
  });

  it("volume modify with previous returns empty (immutability check fires first)", () => {
    const change: Change = {
      status: "modify",
      resource: { kind: "volume", id: "v", config: {}, [MOUNTABLE]: true },
      previous: {},
    };
    deepStrictEqual(defaultPlan(change), []);
  });

  it("service modify with previous and spec change returns recreate", () => {
    const s = svc("api", { image: "new" });
    const change: Change = {
      status: "modify",
      resource: s,
      previous: { image: "old" },
    };
    deepStrictEqual(defaultPlan(change), [{ action: "recreate", resource: s }]);
  });

  it("service modify with previous and only non-spec changes returns empty", () => {
    const change: Change = {
      status: "modify",
      resource: svc("api", { image: "test", route: "new.example.com" }),
      previous: { image: "test", route: "old.example.com" },
    };
    deepStrictEqual(defaultPlan(change), []);
  });

  it("service modify with previous and dev-only change returns empty", () => {
    const change: Change = {
      status: "modify",
      resource: svc("api", { image: "test", dev: { command: "npm dev" } }),
      previous: { image: "test" },
    };
    deepStrictEqual(defaultPlan(change), []);
  });

  it("service modify without previous returns recreate (fallback)", () => {
    const s = svc("api");
    const change: Change = { status: "modify", resource: s };
    deepStrictEqual(defaultPlan(change), [{ action: "recreate", resource: s }]);
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
    const s = svc("api");
    const change: Change = { status: "create", resource: s };
    deepStrictEqual(defaultPlan(change), [{ action: "create", resource: s }]);
  });

  it("volume create returns create", () => {
    const change: Change = {
      status: "create",
      resource: { kind: "volume", id: "v", config: {}, [MOUNTABLE]: true },
    };
    deepStrictEqual(defaultPlan(change), [
      {
        action: "create",
        resource: { kind: "volume", id: "v", config: {}, [MOUNTABLE]: true },
      },
    ]);
  });
});
