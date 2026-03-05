import {
  deepStrictEqual,
  match,
  notStrictEqual,
  ok,
  strictEqual,
} from "node:assert";
import { describe, it } from "node:test";
import { buildURN, MOUNTABLE, type URN } from "@vyft/primitives";
import { sec, svc, vol } from "./helpers.test-utils.ts";
import type { StateEntry } from "./plan.ts";
import { fingerprint, plan, serializeConfig } from "./plan.ts";

/** Flatten Change[][] to Change[] for simpler assertions. */
function flat(levels: ReturnType<typeof plan>) {
  return levels.flat();
}

describe("fingerprint", () => {
  it("is stable for the same resource", () => {
    const v = vol("data");
    strictEqual(fingerprint(v), fingerprint(v));
  });

  it("returns a hex hash string", () => {
    const v = vol("data");
    match(fingerprint(v), /^[a-f0-9]{64}$/);
  });

  it("changes when config changes", () => {
    const a = vol("data");
    const b = {
      kind: "volume" as const,
      id: "data",
      urn: buildURN("platform", "default", "volume", "data"),
      config: { size: "10Gi" },
      [MOUNTABLE]: true as const,
    };
    notStrictEqual(fingerprint(a), fingerprint(b));
  });

  it("is stable regardless of key insertion order", () => {
    const a = svc("api", { image: "node", port: 8080 });
    const b = svc("api", { port: 8080, image: "node" });
    strictEqual(fingerprint(a), fingerprint(b));
  });

  it("ignores dependency config changes via ID replacement", () => {
    const v1 = vol("data");
    const v2 = {
      kind: "volume" as const,
      id: "data",
      urn: buildURN("platform", "default", "volume", "data"),
      config: { size: "10Gi" },
      [MOUNTABLE]: true as const,
    };
    const a = svc("api", {
      image: "node",
      mounts: [{ source: v1, path: "/data" }],
    });
    const b = svc("api", {
      image: "node",
      mounts: [{ source: v2, path: "/data" }],
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
    const changes = flat(plan([v], []));
    strictEqual(changes.length, 1);
    strictEqual(changes[0]?.status, "create");
    if (changes[0]?.status === "create") {
      strictEqual(changes[0].resource.id, "data");
    }
  });

  it("detects removed resources", () => {
    const urn = buildURN("platform", "default", "volume", "data");
    const current: StateEntry[] = [{ urn, fingerprint: "x" }];
    const changes = flat(plan([], current));
    deepStrictEqual(changes, [{ status: "remove", urn }]);
  });

  it("detects modifications from fingerprint mismatch", () => {
    const v = vol("data");
    const current: StateEntry[] = [{ urn: v.urn as URN, fingerprint: "stale" }];
    const changes = flat(plan([v], current));
    strictEqual(changes.length, 1);
    strictEqual(changes[0]?.status, "modify");
  });

  it("returns empty when fingerprints match", () => {
    const v = vol("data");
    const current: StateEntry[] = [
      { urn: v.urn as URN, fingerprint: fingerprint(v) },
    ];
    deepStrictEqual(plan([v], current), []);
  });

  it("creates multiple resources from empty state", () => {
    const a = vol("a");
    const b = sec("b");
    const changes = flat(plan([a, b], []));
    strictEqual(changes.length, 2);
    ok(changes.every((c) => c.status === "create"));
  });

  it("removes multiple resources when desired is empty", () => {
    const urnA = buildURN("platform", "default", "volume", "a");
    const urnB = buildURN("platform", "default", "variable", "b");
    const current: StateEntry[] = [
      { urn: urnA, fingerprint: "x" },
      { urn: urnB, fingerprint: "y" },
    ];
    const changes = flat(plan([], current));
    deepStrictEqual(changes, [
      { status: "remove", urn: urnA },
      { status: "remove", urn: urnB },
    ]);
  });

  it("handles mixed creates, modifies, and removes", () => {
    const existing = vol("keep");
    const modified = vol("mod");
    const added = sec("new");
    const current: StateEntry[] = [
      { urn: existing.urn as URN, fingerprint: fingerprint(existing) },
      { urn: modified.urn as URN, fingerprint: "old" },
      {
        urn: buildURN("platform", "default", "variable", "gone"),
        fingerprint: "x",
      },
    ];
    const changes = flat(plan([existing, modified, added], current));
    const statuses = changes.map((c) => c.status);
    ok(statuses.includes("modify"));
    ok(statuses.includes("create"));
    ok(statuses.includes("remove"));
  });

  it("taintedIds forces modify even when fingerprint matches", () => {
    const v = vol("data");
    const current: StateEntry[] = [
      { urn: v.urn as URN, fingerprint: fingerprint(v) },
    ];
    const changes = flat(plan([v], current, new Set(["data"])));
    strictEqual(changes.length, 1);
    strictEqual(changes[0]?.status, "modify");
  });

  it("taintedIds does not affect resources not in the set", () => {
    const a = vol("a");
    const b = vol("b");
    const current: StateEntry[] = [
      { urn: a.urn as URN, fingerprint: fingerprint(a) },
      { urn: b.urn as URN, fingerprint: fingerprint(b) },
    ];
    const changes = flat(plan([a, b], current, new Set(["a"])));
    strictEqual(changes.length, 1);
    strictEqual(changes[0]?.status, "modify");
    if (changes[0]?.status === "modify") {
      strictEqual(changes[0]?.resource.id, "a");
    }
  });

  it("taintedIds with empty set behaves like no tainted ids", () => {
    const v = vol("data");
    const current: StateEntry[] = [
      { urn: v.urn as URN, fingerprint: fingerprint(v) },
    ];
    deepStrictEqual(plan([v], current, new Set()), []);
  });

  it("threads previous from StateEntry inputs into modify change", () => {
    const v = vol("data");
    const inputs = { size: "5Gi" };
    const current: StateEntry[] = [
      { urn: v.urn as URN, fingerprint: "stale", inputs },
    ];
    const changes = flat(plan([v], current));
    strictEqual(changes.length, 1);
    strictEqual(changes[0]?.status, "modify");
    if (changes[0]?.status === "modify") {
      deepStrictEqual(changes[0]?.previous, inputs);
    }
  });

  it("omits previous when StateEntry has no inputs", () => {
    const v = vol("data");
    const current: StateEntry[] = [{ urn: v.urn as URN, fingerprint: "stale" }];
    const changes = flat(plan([v], current));
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
      { urn: v.urn as URN, fingerprint: fingerprint(v), inputs },
    ];
    const changes = flat(plan([v], current, new Set(["data"])));
    strictEqual(changes.length, 1);
    strictEqual(changes[0]?.status, "modify");
    if (changes[0]?.status === "modify") {
      strictEqual("previous" in changes[0], false);
    }
  });

  it("returns levels grouped by dependency order", () => {
    const v = vol("data");
    const api = svc("api", {
      image: "node",
      mounts: [{ source: v, path: "/data" }],
    });
    const levels = plan([v, api], []);
    ok(levels.length >= 2, "should have at least 2 levels");
    ok(
      levels[0]?.some((c) => c.status === "create" && c.resource.id === "data"),
    );
    ok(
      levels[1]?.some((c) => c.status === "create" && c.resource.id === "api"),
    );
  });

  it("puts removals in the final level", () => {
    const v = vol("data");
    const urn = buildURN("platform", "default", "variable", "old");
    const current: StateEntry[] = [{ urn, fingerprint: "x" }];
    const levels = plan([v], current);
    const lastLevel = levels.at(-1) as (typeof levels)[number];
    ok(lastLevel.some((c) => c.status === "remove"));
  });
});

describe("serializeConfig", () => {
  it("replaces nested Volume objects with their IDs", () => {
    const v = vol("data");
    const result = serializeConfig({ mounts: [{ source: v, path: "/d" }] });
    deepStrictEqual(result, { mounts: [{ source: "data", path: "/d" }] });
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
      mounts: [{ source: v, path: "/d" }],
      env: { SECRET: s },
      image: "node",
    };
    const first = serializeConfig(config);
    const second = serializeConfig(first);
    deepStrictEqual(first, second);
  });
});
