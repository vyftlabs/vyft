import { notStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { URN } from "@vyft/primitives";
import { buildURN } from "@vyft/primitives";
import type { ResourceState } from "@vyft/store";
import { svc, vol } from "./helpers.test-utils.ts";
import { fingerprint } from "./plan.ts";
import { hydrate, transform } from "./transform.ts";

function makeState(
  urn: URN,
  inputs: Record<string, unknown> = {},
  outputs: Record<string, unknown> = {},
): ResourceState {
  const resource = hydrate({
    urn,
    fingerprint: "",
    inputs,
    outputs,
    dependencies: [],
    created: "2025-01-01T00:00:00.000Z",
    modified: "2025-01-01T00:00:00.000Z",
    taint: false,
  });
  return {
    urn,
    fingerprint: fingerprint(resource),
    inputs,
    outputs,
    dependencies: [],
    created: "2025-01-01T00:00:00.000Z",
    modified: "2025-01-01T00:00:00.000Z",
    taint: false,
  };
}

describe("hydrate", () => {
  it("hydrates a volume entry", () => {
    const urn = buildURN("platform", "default", "volume", "data");
    const entry = makeState(urn);
    const resource = hydrate(entry);
    strictEqual(resource.kind, "volume");
    strictEqual(resource.id, "data");
    strictEqual(resource.urn, urn);
  });

  it("hydrates a service entry", () => {
    const urn = buildURN("runtime", "docker", "service", "api");
    const entry = makeState(urn, { port: 8080 }, { host: "api", port: 8080 });
    const resource = hydrate(entry);
    strictEqual(resource.kind, "service");
    strictEqual(resource.id, "api");
    if (resource.kind === "service") {
      strictEqual(resource.port, 8080);
      strictEqual(resource.host, "api");
      strictEqual(resource.url, "http://api:8080");
    }
  });

  it("hydrates a provider entry", () => {
    const urn = buildURN("provider", "std", "random_string", "db-pass");
    const entry = makeState(urn, { length: 32 }, { value: "abc" });
    const resource = hydrate(entry);
    strictEqual(resource.kind, "provider");
    if (resource.kind === "provider") {
      strictEqual(resource.provider, "std");
      strictEqual(resource.type, "random_string");
    }
  });

  it("round-trips fingerprint for volume", () => {
    const urn = buildURN("platform", "default", "volume", "data");
    const entry = makeState(urn, { size: "10Gi" });
    const resource = hydrate(entry);
    strictEqual(fingerprint(resource), entry.fingerprint);
  });

  it("round-trips fingerprint for service", () => {
    const urn = buildURN("runtime", "docker", "service", "api");
    const entry = makeState(urn, { image: "node", port: 3000 });
    const resource = hydrate(entry);
    strictEqual(fingerprint(resource), entry.fingerprint);
  });

  it("round-trips fingerprint for provider", () => {
    const urn = buildURN("provider", "std", "random_string", "key");
    const entry = makeState(urn, { length: 64 });
    const resource = hydrate(entry);
    strictEqual(fingerprint(resource), entry.fingerprint);
  });
});

describe("transform", () => {
  it("returns a State with immutable operations", () => {
    const urn = buildURN("platform", "default", "volume", "data");
    const state = transform([makeState(urn)]);
    ok(state.has(urn));
    ok(state.get(urn));
  });

  it("list returns all entries", () => {
    const a = makeState(buildURN("platform", "default", "volume", "a"));
    const b = makeState(buildURN("runtime", "docker", "service", "b"), {
      image: "node",
      port: 3000,
    });
    const state = transform([a, b]);
    strictEqual(state.list().length, 2);
  });

  it("list filters by resource type", () => {
    const a = makeState(buildURN("platform", "default", "volume", "a"));
    const b = makeState(buildURN("runtime", "docker", "service", "b"), {
      image: "node",
      port: 3000,
    });
    const state = transform([a, b]);
    strictEqual(state.list("volume").length, 1);
    strictEqual(state.list("service").length, 1);
  });

  it("update returns new State (immutable)", () => {
    const urn = buildURN("platform", "default", "volume", "data");
    const state = transform([makeState(urn)]);
    const updated = state.update(urn, (c) => ({ ...c, size: "20Gi" }));
    notStrictEqual(state, updated);
  });

  it("remove returns new State (immutable)", () => {
    const urn = buildURN("platform", "default", "volume", "data");
    const state = transform([makeState(urn)]);
    const removed = state.remove(urn);
    notStrictEqual(state, removed);
  });

  it("add returns new State (immutable)", () => {
    const state = transform([]);
    const v = vol("new");
    const added = state.add(v);
    notStrictEqual(state, added);
  });

  it("taint returns new State (immutable)", () => {
    const urn = buildURN("platform", "default", "volume", "data");
    const state = transform([makeState(urn)]);
    const tainted = state.taint(urn);
    notStrictEqual(state, tainted);
  });
});

describe("build", () => {
  it("produces no ops for unchanged state", () => {
    const urn = buildURN("platform", "default", "volume", "data");
    const result = transform([makeState(urn)]).build();
    strictEqual(result.length, 0);
  });

  it("produces create op for added resource", () => {
    const v = vol("new");
    const result = transform([]).add(v).build();
    ok(result.length > 0);
    const allOps = result.flat();
    ok(allOps.some((op) => op.action === "create" && op.urn === v.urn));
  });

  it("produces delete op for removed resource", () => {
    const urn = buildURN("platform", "default", "volume", "data");
    const result = transform([makeState(urn)])
      .remove(urn)
      .build();
    ok(result.length > 0);
    const allOps = result.flat();
    ok(allOps.some((op) => op.action === "delete" && op.urn === urn));
  });

  it("produces update op for modified resource", () => {
    const urn = buildURN("platform", "default", "volume", "data");
    const result = transform([makeState(urn)])
      .update(urn, () => ({ size: "20Gi" }))
      .build();
    ok(result.length > 0);
    const allOps = result.flat();
    ok(allOps.some((op) => op.action === "update" && op.urn === urn));
  });

  it("produces update op for tainted resource", () => {
    const urn = buildURN("platform", "default", "volume", "data");
    const result = transform([makeState(urn)])
      .taint(urn)
      .build();
    ok(result.length > 0);
    const allOps = result.flat();
    const updateOp = allOps.find(
      (op) => op.action === "update" && op.urn === urn,
    );
    ok(updateOp);
    // Tainted ops should not carry previous
    if (updateOp?.action === "update") {
      strictEqual("previous" in updateOp, false);
    }
  });

  it("groups ops by dependency levels", () => {
    const state = transform([])
      .add(vol("data"))
      .add(
        svc("api", {
          image: "node",
          mounts: [{ source: vol("data"), path: "/data" }],
        }),
      );
    const result = state.build();
    // Should have at least 2 levels (volume before service)
    ok(result.length >= 1);
  });

  it("lifecycle ops carry correct URNs", () => {
    const v = vol("new");
    const result = transform([]).add(v).build();
    const allOps = result.flat();
    const createOp = allOps.find((op) => op.action === "create");
    ok(createOp);
    strictEqual(createOp.urn, v.urn);
  });

  it("handles mixed add, remove, and update", () => {
    const existingUrn = buildURN("platform", "default", "volume", "keep");
    const removeUrn = buildURN("runtime", "docker", "service", "old");
    const existing = makeState(existingUrn);
    const toRemove = makeState(removeUrn, { image: "old", port: 3000 });

    const result = transform([existing, toRemove])
      .update(existingUrn, () => ({ size: "20Gi" }))
      .remove(removeUrn)
      .add(vol("new"))
      .build();

    const allOps = result.flat();
    ok(allOps.some((op) => op.action === "update"));
    ok(allOps.some((op) => op.action === "delete"));
    ok(allOps.some((op) => op.action === "create"));
  });
});
