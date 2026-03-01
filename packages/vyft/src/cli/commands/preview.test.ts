import { ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  buildGraph,
  collect,
  fingerprint,
  order,
  plan,
  validate,
} from "@vyft/engine";
import type { ResourceState } from "@vyft/store";

function vol(id: string, config: Record<string, unknown> = {}) {
  return { kind: "volume" as const, id, config };
}

function sec(id: string) {
  return { kind: "secret" as const, id, config: {} };
}

function makeResourceState(
  id: string,
  kind: ResourceState["kind"],
  fp: string,
): ResourceState {
  return {
    id,
    kind,
    fingerprint: fp,
    inputs: {},
    outputs: {},
    dependencies: [],
    runtime: {},
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    taint: false,
  };
}

describe("preview logic", () => {
  it("detects creates on first deploy", () => {
    const v = vol("data");
    const s = sec("pass");

    const resources = collect({ v, s });
    const graph = buildGraph(resources);
    validate(graph);
    const changes = plan(order(graph), []);

    strictEqual(changes.length, 2);
    ok(changes.every((c) => c.status === "create"));
  });

  it("detects no changes when state matches", () => {
    const v = vol("data");

    const resources = collect({ v });
    const graph = buildGraph(resources);
    validate(graph);

    const state = [makeResourceState("data", "volume", fingerprint(v))];
    const changes = plan(order(graph), state);
    strictEqual(changes.length, 0);
  });

  it("detects modifications", () => {
    const v = vol("data", { size: "10Gi" });

    const resources = collect({ v });
    const graph = buildGraph(resources);
    validate(graph);

    const state = [makeResourceState("data", "volume", "old-fingerprint")];
    const changes = plan(order(graph), state);

    strictEqual(changes.length, 1);
    strictEqual(changes[0]?.status, "modify");
  });

  it("detects removals", () => {
    const resources = collect({});
    const graph = buildGraph(resources);
    validate(graph);

    const state = [makeResourceState("data", "volume", "fp")];
    const changes = plan(order(graph), state);

    strictEqual(changes.length, 1);
    strictEqual(changes[0]?.status, "remove");
  });

  it("detects mixed creates, modifies, and removes", () => {
    const existing = vol("existing");
    const modified = vol("modified", { size: "20Gi" });
    const added = sec("new-secret");

    const resources = collect({ existing, modified, added });
    const graph = buildGraph(resources);
    validate(graph);

    const state = [
      makeResourceState("existing", "volume", fingerprint(existing)),
      makeResourceState("modified", "volume", "old-fp"),
      makeResourceState("removed", "secret", "fp"),
    ];

    const changes = plan(order(graph), state);

    const creates = changes.filter((c) => c.status === "create");
    const modifies = changes.filter((c) => c.status === "modify");
    const removes = changes.filter((c) => c.status === "remove");

    strictEqual(creates.length, 1);
    strictEqual(modifies.length, 1);
    strictEqual(removes.length, 1);
  });
});
