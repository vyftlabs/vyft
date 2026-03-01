import { deepStrictEqual, notStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { StateEntry } from "@vyft/core";
import { fingerprint, serializeConfig } from "@vyft/core";
import { sec, svc, vol } from "./helpers.test-utils.ts";
import { plan } from "./plan.ts";

describe("fingerprint", () => {
  it("is stable for the same resource", () => {
    const v = vol("data");
    strictEqual(fingerprint(v), fingerprint(v));
  });

  it("changes when config changes", () => {
    const a = vol("data");
    const b = { kind: "volume" as const, id: "data", config: { size: "10Gi" } };
    notStrictEqual(fingerprint(a), fingerprint(b));
  });

  it("replaces nested resources with their IDs", () => {
    const v = vol("data");
    const a = svc("api", {
      image: "node",
      mounts: [{ volume: v, path: "/data" }],
    });
    const parsed = JSON.parse(fingerprint(a));
    strictEqual(parsed.config.mounts[0].volume, "data");
  });

  it("replaces nested secrets with their IDs", () => {
    const s = sec("pass");
    const a = svc("api", { image: "node", env: { SECRET: s } });
    const parsed = JSON.parse(fingerprint(a));
    strictEqual(parsed.config.env.SECRET, "pass");
  });

  it("leaves non-resource nested objects intact", () => {
    const a = svc("api", { image: "node", env: { HOST: "localhost" } });
    const parsed = JSON.parse(fingerprint(a));
    strictEqual(parsed.config.env.HOST, "localhost");
  });

  it("handles primitive and null values in config", () => {
    const a = svc("api", { image: "node", port: 8080 });
    const parsed = JSON.parse(fingerprint(a));
    strictEqual(parsed.config.port, 8080);
    strictEqual(parsed.config.image, "node");
  });

  it("is stable regardless of key insertion order", () => {
    const a = svc("api", { image: "node", port: 8080 });
    const b = svc("api", { port: 8080, image: "node" });
    strictEqual(fingerprint(a), fingerprint(b));
  });

  it("only includes kind, id, and config", () => {
    const a = svc("api", { image: "node" });
    const parsed = JSON.parse(fingerprint(a));
    deepStrictEqual(Object.keys(parsed).sort(), ["config", "id", "kind"]);
  });

  it("ignores dependency config changes via ID replacement", () => {
    const v1 = vol("data");
    const v2 = {
      kind: "volume" as const,
      id: "data",
      config: { size: "10Gi" },
    };
    const a = svc("api", {
      image: "node",
      mounts: [{ volume: v1, path: "/data" }],
    });
    const b = svc("api", {
      image: "node",
      mounts: [{ volume: v2, path: "/data" }],
    });
    strictEqual(fingerprint(a), fingerprint(b));
  });
});

describe("plan", () => {
  it("returns empty for empty desired and current", () => {
    deepStrictEqual(plan([], []), []);
  });

  it("detects new resources as creates", () => {
    const v = vol("data");
    deepStrictEqual(plan([v], []), [{ status: "create", resource: v }]);
  });

  it("detects removed resources", () => {
    const current: StateEntry[] = [
      { id: "data", kind: "volume", fingerprint: "x" },
    ];
    deepStrictEqual(plan([], current), [
      { status: "remove", id: "data", kind: "volume" },
    ]);
  });

  it("detects modifications from fingerprint mismatch", () => {
    const v = vol("data");
    const current: StateEntry[] = [
      { id: "data", kind: "volume", fingerprint: "stale" },
    ];
    deepStrictEqual(plan([v], current), [{ status: "modify", resource: v }]);
  });

  it("returns empty when fingerprints match", () => {
    const v = vol("data");
    const current: StateEntry[] = [
      { id: "data", kind: "volume", fingerprint: fingerprint(v) },
    ];
    deepStrictEqual(plan([v], current), []);
  });

  it("creates multiple resources from empty state", () => {
    const a = vol("a");
    const b = sec("b");
    const changes = plan([a, b], []);
    deepStrictEqual(changes, [
      { status: "create", resource: a },
      { status: "create", resource: b },
    ]);
  });

  it("removes multiple resources when desired is empty", () => {
    const current: StateEntry[] = [
      { id: "a", kind: "volume", fingerprint: "x" },
      { id: "b", kind: "config", fingerprint: "y" },
    ];
    const changes = plan([], current);
    deepStrictEqual(changes, [
      { status: "remove", id: "a", kind: "volume" },
      { status: "remove", id: "b", kind: "config" },
    ]);
  });

  it("handles mixed creates, modifies, and removes", () => {
    const existing = vol("keep");
    const modified = vol("mod");
    const added = sec("new");
    const current: StateEntry[] = [
      { id: "keep", kind: "volume", fingerprint: fingerprint(existing) },
      { id: "mod", kind: "volume", fingerprint: "old" },
      { id: "gone", kind: "config", fingerprint: "x" },
    ];
    const changes = plan([existing, modified, added], current);
    const statuses = changes.map((c) => c.status);
    deepStrictEqual(statuses, ["modify", "create", "remove"]);
  });

  it("taintedIds forces modify even when fingerprint matches", () => {
    const v = vol("data");
    const current: StateEntry[] = [
      { id: "data", kind: "volume", fingerprint: fingerprint(v) },
    ];
    const changes = plan([v], current, new Set(["data"]));
    strictEqual(changes.length, 1);
    strictEqual(changes[0]?.status, "modify");
  });

  it("taintedIds does not affect resources not in the set", () => {
    const a = vol("a");
    const b = vol("b");
    const current: StateEntry[] = [
      { id: "a", kind: "volume", fingerprint: fingerprint(a) },
      { id: "b", kind: "volume", fingerprint: fingerprint(b) },
    ];
    const changes = plan([a, b], current, new Set(["a"]));
    strictEqual(changes.length, 1);
    strictEqual(changes[0]?.status, "modify");
    if (changes[0]?.status === "modify") {
      strictEqual(changes[0]?.resource.id, "a");
    }
  });

  it("taintedIds with empty set behaves like no tainted ids", () => {
    const v = vol("data");
    const current: StateEntry[] = [
      { id: "data", kind: "volume", fingerprint: fingerprint(v) },
    ];
    deepStrictEqual(plan([v], current, new Set()), []);
  });

  it("threads previous from StateEntry inputs into modify change", () => {
    const v = vol("data");
    const inputs = { size: "5Gi" };
    const current: StateEntry[] = [
      { id: "data", kind: "volume", fingerprint: "stale", inputs },
    ];
    const changes = plan([v], current);
    strictEqual(changes.length, 1);
    strictEqual(changes[0]?.status, "modify");
    if (changes[0]?.status === "modify") {
      deepStrictEqual(changes[0]?.previous, inputs);
    }
  });

  it("omits previous when StateEntry has no inputs", () => {
    const v = vol("data");
    const current: StateEntry[] = [
      { id: "data", kind: "volume", fingerprint: "stale" },
    ];
    const changes = plan([v], current);
    strictEqual(changes.length, 1);
    strictEqual(changes[0]?.status, "modify");
    if (changes[0]?.status === "modify") {
      strictEqual("previous" in changes[0], false);
    }
  });

  it("omits previous for tainted resource even with inputs", () => {
    const v = vol("data");
    const inputs = { size: "5Gi" };
    const current: StateEntry[] = [
      { id: "data", kind: "volume", fingerprint: fingerprint(v), inputs },
    ];
    const changes = plan([v], current, new Set(["data"]));
    strictEqual(changes.length, 1);
    strictEqual(changes[0]?.status, "modify");
    if (changes[0]?.status === "modify") {
      strictEqual("previous" in changes[0], false);
    }
  });
});

describe("serializeConfig", () => {
  it("replaces nested Volume objects with their IDs", () => {
    const v = vol("data");
    const result = serializeConfig({ mounts: [{ volume: v, path: "/d" }] });
    deepStrictEqual(result, { mounts: [{ volume: "data", path: "/d" }] });
  });

  it("replaces nested Secret objects with their IDs", () => {
    const s = sec("pass");
    const result = serializeConfig({ env: { SECRET: s } });
    deepStrictEqual(result, { env: { SECRET: "pass" } });
  });

  it("leaves primitive and null values unchanged", () => {
    const result = serializeConfig({ image: "node", port: 3000, extra: null });
    deepStrictEqual(result, { image: "node", port: 3000, extra: null });
  });

  it("is idempotent", () => {
    const v = vol("data");
    const s = sec("pass");
    const config = {
      mounts: [{ volume: v, path: "/d" }],
      env: { SECRET: s },
      image: "node",
    };
    const first = serializeConfig(config);
    const second = serializeConfig(first);
    deepStrictEqual(first, second);
  });
});
