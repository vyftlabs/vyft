import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { ResourceState } from "@vyft/core";
import { buildURN, parseURN } from "@vyft/core";
import type { URN } from "@vyft/primitives";
import { Store } from "@vyft/store";

function makeResource(
  id: string,
  kind: string,
  outputs: Record<string, unknown> = {},
): ResourceState {
  const module =
    kind === "volume" || kind === "variable" ? "platform" : "runtime";
  return {
    urn: buildURN(module, "default", kind, id),
    fingerprint: `fp-${id}`,
    inputs: {},
    outputs,
    dependencies: [],
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    taint: false,
  };
}

function toMap(entries: ResourceState[]): Map<URN, ResourceState> {
  const m = new Map<URN, ResourceState>();
  for (const e of entries) m.set(e.urn, e);
  return m;
}

describe("output logic", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "vyft-output-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("loads outputs from state", async () => {
    const dir = join(root, "state");
    const store = await Store.open(dir);
    store.state = toMap([
      makeResource("api", "service", {
        host: "api",
        port: 3000,
        url: "http://api:3000",
      }),
      makeResource("data", "volume"),
    ]);
    await store.checkpoint();
    await store.dispose();

    const store2 = await Store.open(dir);
    const api = [...store2.state.values()].find(
      (r) => parseURN(r.urn).id === "api",
    );
    ok(api, "api resource should exist");
    deepStrictEqual(api.outputs, {
      host: "api",
      port: 3000,
      url: "http://api:3000",
    });
    await store2.dispose();
  });

  it("filters by resource id", async () => {
    const dir = join(root, "state");
    const store = await Store.open(dir);
    store.state = toMap([
      makeResource("api", "service", { host: "api" }),
      makeResource("web", "service", { host: "web" }),
    ]);
    await store.checkpoint();
    await store.dispose();

    const store2 = await Store.open(dir);
    const filtered = [...store2.state.values()].filter(
      (r) => parseURN(r.urn).id === "api",
    );
    strictEqual(filtered.length, 1);
    strictEqual(parseURN(filtered[0]!.urn).id, "api");
    await store2.dispose();
  });

  it("returns empty outputs for volumes and secrets", async () => {
    const dir = join(root, "state");
    const store = await Store.open(dir);
    store.state = toMap([
      makeResource("data", "volume"),
      makeResource("pass", "secret"),
    ]);
    await store.checkpoint();
    await store.dispose();

    const store2 = await Store.open(dir);
    for (const r of store2.state.values()) {
      deepStrictEqual(r.outputs, {});
    }
    await store2.dispose();
  });

  it("json format includes all resources", async () => {
    const dir = join(root, "state");
    const store = await Store.open(dir);
    store.state = toMap([
      makeResource("api", "service", { host: "api", port: 3000 }),
      makeResource("data", "volume"),
    ]);
    await store.checkpoint();
    await store.dispose();

    const store2 = await Store.open(dir);
    const obj: Record<string, unknown> = {};
    for (const r of store2.state.values()) obj[parseURN(r.urn).id] = r.outputs;

    deepStrictEqual(obj, {
      api: { host: "api", port: 3000 },
      data: {},
    });
    await store2.dispose();
  });
});
