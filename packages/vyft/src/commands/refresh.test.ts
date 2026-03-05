import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { ResourceState } from "@vyft/core";
import type { URN } from "@vyft/primitives";
import { buildURN, MOUNTABLE, parseURN } from "@vyft/core";
import {
  buildGraph,
  collect,
  fingerprint,
  resourceURN,
  validate,
} from "@vyft/engine";
import { Store } from "@vyft/store";

/** Build initial state from config, simulating what deploy would produce. */
function buildState(config: unknown): ResourceState[] {
  const resources = collect(config);
  const graph = buildGraph(resources);
  validate(graph);
  const now = new Date().toISOString();
  return resources.map((r) => {
    const deps = graph.dependencies.get(r.id);
    const depUrns = deps
      ? [...deps].map((depId) => {
          const depResource = resources.find((res) => res.id === depId);
          return depResource ? resourceURN(depResource) : resourceURN(r);
        })
      : [];
    return {
      urn: resourceURN(r),
      fingerprint: fingerprint(r),
      inputs: JSON.parse(
        JSON.stringify(r.kind === "provider" ? r.input : r.config),
      ) as Record<string, unknown>,
      outputs: {},
      dependencies: depUrns,
      created: now,
      modified: now,
      taint: false,
    };
  });
}

function vol(id: string, config: Record<string, unknown> = {}) {
  return { kind: "volume" as const, id, config, [MOUNTABLE]: true as const };
}

function sec(id: string) {
  return { kind: "variable" as const, id, config: {} };
}

/** Simulate what the refresh command does: re-fingerprint from config, update state. */
function refreshState(
  config: unknown,
  previous: ResourceState[],
): ResourceState[] {
  const resources = collect(config);
  const graph = buildGraph(resources);
  validate(graph);

  const previousMap = new Map<string, ResourceState>();
  for (const entry of previous) {
    previousMap.set(parseURN(entry.urn).id, entry);
  }

  const now = new Date().toISOString();

  return resources.map((r) => {
    const prev = previousMap.get(r.id);
    const fp = fingerprint(r);
    const deps = graph.dependencies.get(r.id);
    const rawInputs = r.kind === "provider" ? r.input : r.config;
    const urn = resourceURN(r);
    const depUrns = deps
      ? [...deps].map((depId) => {
          const depResource = resources.find((res) => res.id === depId);
          return depResource ? resourceURN(depResource) : urn;
        })
      : [];
    return {
      urn,
      fingerprint: fp,
      inputs: JSON.parse(JSON.stringify(rawInputs)) as Record<string, unknown>,
      outputs: prev?.outputs ?? {},
      dependencies: depUrns,
      created: prev?.created ?? now,
      modified: prev ? (prev.fingerprint !== fp ? now : prev.modified) : now,
      taint: false,
    };
  });
}

describe("refresh logic", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "vyft-refresh-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("no-op when config matches state", () => {
    const v = vol("data");

    const state = buildState({ v });

    const refreshed = refreshState({ v }, state);

    strictEqual(refreshed.length, 1);
    strictEqual(refreshed[0]?.fingerprint, state[0]?.fingerprint);
  });

  it("updates fingerprint when config changes", () => {
    const v1 = vol("data");

    const state = buildState({ v: v1 });

    const v2 = vol("data", { size: "20Gi" });
    const refreshed = refreshState({ v: v2 }, state);

    strictEqual(refreshed.length, 1);
    ok(refreshed[0]?.fingerprint !== state[0]?.fingerprint);
    strictEqual(refreshed[0]?.created, state[0]?.created);
  });

  it("adds new resources from config", () => {
    const v = vol("data");

    const state = buildState({ v });

    const s = sec("pass");
    const refreshed = refreshState({ v, s }, state);

    strictEqual(refreshed.length, 2);
    ok(refreshed.some((r) => parseURN(r.urn).id === "pass"));
  });

  it("removes resources not in config", () => {
    const v = vol("data");
    const s = sec("pass");

    const state = buildState({ v, s });

    const refreshed = refreshState({ v }, state);

    strictEqual(refreshed.length, 1);
    strictEqual(parseURN(refreshed[0]?.urn).id, "data");
  });

  it("refresh produces clean state even if WAL existed", async () => {
    const dir = join(root, "state");
    const v = vol("data");

    const state = buildState({ v });

    // Convert array to Map for store
    const stateMap = new Map<URN, ResourceState>();
    for (const entry of state) stateMap.set(entry.urn, entry);

    const store = await Store.open(dir);
    store.state = stateMap;
    await store.checkpoint();

    // Simulate an interrupted operation by appending a WAL entry
    await store.append({
      type: "pending",
      urn: buildURN("platform", "default", "volume", "data"),
      action: "updating",
    });
    ok(await store.hasWAL());

    // Refresh compacts state, clearing WAL
    const storeEntries = [...store.state.values()];
    const refreshed = refreshState({ v }, storeEntries);
    const refreshedMap = new Map<URN, ResourceState>();
    for (const entry of refreshed) refreshedMap.set(entry.urn, entry);
    store.state = refreshedMap;
    await store.checkpoint();

    strictEqual(await store.hasWAL(), false);
    strictEqual(store.state.size, 1);
    await store.dispose();
  });

  it("preserves outputs from previous state", () => {
    const state: ResourceState[] = [
      {
        urn: buildURN("platform", "default", "volume", "data"),
        fingerprint: fingerprint(vol("data")),
        inputs: {},
        outputs: { mountPath: "/data" },
        dependencies: [],
        created: "2025-01-01T00:00:00.000Z",
        modified: "2025-01-01T00:00:00.000Z",
        taint: false,
      },
    ];

    const v = vol("data");
    const refreshed = refreshState({ v }, state);

    deepStrictEqual(refreshed[0]?.outputs, { mountPath: "/data" });
  });
});
