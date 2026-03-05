import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { Service, Variable, Volume } from "@vyft/primitives";
import { buildURN, INTERNAL, MOUNTABLE } from "@vyft/primitives";
import { changedFields, hasSpecChange, NON_SPEC_FIELDS } from "./diff.ts";

function vol(id: string): Volume {
  return {
    kind: "volume",
    id,
    urn: buildURN("platform", "default", "volume", id),
    config: {},
    [MOUNTABLE]: true,
  };
}

function sec(id: string): Variable {
  return {
    kind: "variable",
    id,
    urn: buildURN("platform", "default", "variable", id),
    config: {},
  };
}

function svc(id: string): Service {
  return {
    kind: "service",
    id,
    urn: buildURN("runtime", "default", "service", id),
    config: { image: "test" },
    host: id,
    port: 3000,
    url: `http://${id}:3000`,
    [INTERNAL]: { ready: async () => {} }, // no-op for tests
  };
}

describe("changedFields", () => {
  it("returns all keys when previous is empty", () => {
    const changed = changedFields({}, { image: "node", port: 3000 });
    deepStrictEqual(changed, new Set(["image", "port"]));
  });

  it("returns empty set for identical configs", () => {
    const prev = { image: "node", port: 3000 };
    const changed = changedFields(prev, { image: "node", port: 3000 });
    deepStrictEqual(changed, new Set());
  });

  it("handles serialization asymmetry for volume mounts", () => {
    const v = vol("data");
    const prev = { mounts: [{ source: "data", path: "/d" }] };
    const changed = changedFields(prev, {
      mounts: [{ source: v, path: "/d" }],
    });
    deepStrictEqual(changed, new Set());
  });

  it("handles serialization asymmetry for env with same secret", () => {
    const s = sec("db-pass");
    const prev = { env: { DB: "db-pass" } };
    const changed = changedFields(prev, { env: { DB: s } });
    deepStrictEqual(changed, new Set());
  });

  it("detects swapped secret reference", () => {
    const s = sec("new-pass");
    const prev = { env: { DB: "db-pass" } };
    const changed = changedFields(prev, { env: { DB: s } });
    strictEqual(changed.has("env"), true);
  });

  it("handles dependsOn serialization with same services", () => {
    const a = svc("svc-a");
    const prev = { dependsOn: ["svc-a"] };
    const changed = changedFields(prev, { dependsOn: [a] });
    deepStrictEqual(changed, new Set());
  });

  it("detects dependsOn order change (order-sensitive)", () => {
    const a = svc("svc-a");
    const b = svc("svc-b");
    const prev = { dependsOn: ["svc-a", "svc-b"] };
    const changed = changedFields(prev, { dependsOn: [b, a] });
    strictEqual(changed.has("dependsOn"), true);
  });

  it("detects added field", () => {
    const prev = { image: "node" };
    const changed = changedFields(prev, { image: "node", port: 8080 });
    deepStrictEqual(changed, new Set(["port"]));
  });

  it("detects removed field", () => {
    const prev = { image: "node", port: 8080 };
    const changed = changedFields(prev, { image: "node" });
    deepStrictEqual(changed, new Set(["port"]));
  });

  it("detects dependsOn empty array vs absent", () => {
    const prev = { image: "node" };
    const changed = changedFields(prev, { image: "node", dependsOn: [] });
    strictEqual(changed.has("dependsOn"), true);
  });
});

describe("hasSpecChange", () => {
  it("returns false for only non-spec fields", () => {
    const changed = new Set(["route", "replicas", "dev", "dependsOn"]);
    strictEqual(hasSpecChange(changed), false);
  });

  it("returns true for mix of spec and non-spec", () => {
    const changed = new Set(["route", "image"]);
    strictEqual(hasSpecChange(changed), true);
  });

  it("returns true for unknown field name (safe default)", () => {
    const changed = new Set(["futureField"]);
    strictEqual(hasSpecChange(changed), true);
  });

  it("returns false for empty set", () => {
    strictEqual(hasSpecChange(new Set()), false);
  });

  it("NON_SPEC_FIELDS contains exactly route, replicas, dev, dependsOn, link", () => {
    deepStrictEqual(
      new Set(NON_SPEC_FIELDS),
      new Set(["route", "replicas", "dev", "dependsOn", "link"]),
    );
  });
});
