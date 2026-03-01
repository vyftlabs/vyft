import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { PersistedState, ResourceState } from "@vyft/store";
import { createFileStore } from "@vyft/store";

function makeState(resources: ResourceState[]): PersistedState {
  return {
    version: 1,
    manifest: { timestamp: new Date().toISOString(), tool: "vyft" },
    resources,
    secrets: null,
  };
}

function makeResource(
  id: string,
  kind: ResourceState["kind"],
  outputs: Record<string, unknown> = {},
): ResourceState {
  return {
    id,
    kind,
    fingerprint: `fp-${id}`,
    inputs: {},
    outputs,
    dependencies: [],
    runtime: {},
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    taint: false,
  };
}

describe("output logic", () => {
  let root: string;
  const context = "default";
  const project = "test";

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "vyft-output-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("loads outputs from state", async () => {
    const store = createFileStore(root);
    const state = makeState([
      makeResource("api", "service", {
        host: "api",
        port: 3000,
        url: "http://api:3000",
      }),
      makeResource("data", "volume"),
    ]);
    await store.save(context, project, state);

    const loaded = await store.load(context, project);
    ok(loaded, "state should exist");
    const api = loaded.resources.find((r) => r.id === "api");
    ok(api, "api resource should exist");
    deepStrictEqual(api.outputs, {
      host: "api",
      port: 3000,
      url: "http://api:3000",
    });
  });

  it("filters by resource id", async () => {
    const store = createFileStore(root);
    const state = makeState([
      makeResource("api", "service", { host: "api" }),
      makeResource("web", "service", { host: "web" }),
    ]);
    await store.save(context, project, state);

    const loaded = await store.load(context, project);
    ok(loaded, "state should exist");
    const filtered = loaded.resources.filter((r) => r.id === "api");
    strictEqual(filtered.length, 1);
    strictEqual(filtered[0]?.id, "api");
  });

  it("returns empty outputs for volumes and secrets", async () => {
    const store = createFileStore(root);
    const state = makeState([
      makeResource("data", "volume"),
      makeResource("pass", "secret"),
    ]);
    await store.save(context, project, state);

    const loaded = await store.load(context, project);
    ok(loaded, "state should exist");
    for (const r of loaded.resources) {
      deepStrictEqual(r.outputs, {});
    }
  });

  it("json format includes all resources", async () => {
    const store = createFileStore(root);
    const state = makeState([
      makeResource("api", "service", { host: "api", port: 3000 }),
      makeResource("data", "volume"),
    ]);
    await store.save(context, project, state);

    const loaded = await store.load(context, project);
    ok(loaded, "state should exist");
    const obj: Record<string, unknown> = {};
    for (const r of loaded.resources) obj[r.id] = r.outputs;

    deepStrictEqual(obj, {
      api: { host: "api", port: 3000 },
      data: {},
    });
  });
});
