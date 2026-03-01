import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { Change, Operation, Runtime } from "@vyft/core";
import {
  buildGraph,
  collect,
  deploy,
  fingerprint,
  validate,
} from "@vyft/engine";
import type { PersistedState, ResourceState } from "@vyft/store";
import { createFileStore } from "@vyft/store";

function mockRuntime(): Runtime {
  return {
    plan(change: Change): Operation[] {
      if (change.status === "remove") {
        return [{ action: "remove", id: change.id, kind: change.kind }];
      }
      return [
        {
          action: change.status === "create" ? "create" : "update",
          resource: change.resource,
        },
      ];
    },
    async execute(_op: Operation) {},
  };
}

function vol(id: string, config: Record<string, unknown> = {}) {
  return { kind: "volume" as const, id, config };
}

function sec(id: string) {
  return { kind: "secret" as const, id, config: {} };
}

/** Simulate what the refresh command does: re-fingerprint from config, update state. */
function refreshState(
  config: unknown,
  previous: PersistedState,
): PersistedState {
  const resources = collect(config);
  const graph = buildGraph(resources);
  validate(graph);

  const previousMap = new Map<string, ResourceState>();
  for (const entry of previous.resources) {
    previousMap.set(entry.id, entry);
  }

  const now = new Date().toISOString();

  const refreshed: ResourceState[] = resources.map((r) => {
    const prev = previousMap.get(r.id);
    const fp = fingerprint(r);
    const deps = graph.dependencies.get(r.id);
    return {
      id: r.id,
      kind: r.kind,
      fingerprint: fp,
      inputs: JSON.parse(JSON.stringify(r.config)) as Record<string, unknown>,
      outputs: prev?.outputs ?? {},
      dependencies: deps ? [...deps] : [],
      runtime: prev?.runtime ?? {},
      created: prev?.created ?? now,
      modified: prev ? (prev.fingerprint !== fp ? now : prev.modified) : now,
      taint: false,
    };
  });

  return {
    version: previous.version,
    manifest: { timestamp: now, tool: "vyft" },
    resources: refreshed,
    secrets: previous.secrets,
  };
}

describe("refresh logic", () => {
  let root: string;
  const context = "default";
  const project = "test";

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "vyft-refresh-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("no-op when config matches state", async () => {
    const store = createFileStore(root);
    const runtime = mockRuntime();
    const v = vol("data");

    const result = await deploy({ v }, [], runtime);
    const state: PersistedState = {
      version: 1,
      manifest: { timestamp: new Date().toISOString(), tool: "vyft" },
      resources: result.state,
      secrets: null,
    };
    await store.save(context, project, state);

    const refreshed = refreshState({ v }, state);

    strictEqual(refreshed.resources.length, 1);
    strictEqual(
      refreshed.resources[0]?.fingerprint,
      state.resources[0]?.fingerprint,
    );
  });

  it("updates fingerprint when config changes", async () => {
    createFileStore(root);
    const runtime = mockRuntime();
    const v1 = vol("data");

    const result = await deploy({ v: v1 }, [], runtime);
    const state: PersistedState = {
      version: 1,
      manifest: { timestamp: new Date().toISOString(), tool: "vyft" },
      resources: result.state,
      secrets: null,
    };

    const v2 = vol("data", { size: "20Gi" });
    const refreshed = refreshState({ v: v2 }, state);

    strictEqual(refreshed.resources.length, 1);
    ok(refreshed.resources[0]?.fingerprint !== state.resources[0]?.fingerprint);
    strictEqual(refreshed.resources[0]?.created, state.resources[0]?.created);
  });

  it("adds new resources from config", async () => {
    createFileStore(root);
    const runtime = mockRuntime();
    const v = vol("data");

    const result = await deploy({ v }, [], runtime);
    const state: PersistedState = {
      version: 1,
      manifest: { timestamp: new Date().toISOString(), tool: "vyft" },
      resources: result.state,
      secrets: null,
    };

    const s = sec("pass");
    const refreshed = refreshState({ v, s }, state);

    strictEqual(refreshed.resources.length, 2);
    ok(refreshed.resources.some((r) => r.id === "pass"));
  });

  it("removes resources not in config", async () => {
    createFileStore(root);
    const runtime = mockRuntime();
    const v = vol("data");
    const s = sec("pass");

    const result = await deploy({ v, s }, [], runtime);
    const state: PersistedState = {
      version: 1,
      manifest: { timestamp: new Date().toISOString(), tool: "vyft" },
      resources: result.state,
      secrets: null,
    };

    const refreshed = refreshState({ v }, state);

    strictEqual(refreshed.resources.length, 1);
    strictEqual(refreshed.resources[0]?.id, "data");
  });

  it("refresh produces clean state even if WAL existed", async () => {
    const store = createFileStore(root);
    const runtime = mockRuntime();
    const v = vol("data");

    const result = await deploy({ v }, [], runtime);
    const state: PersistedState = {
      version: 1,
      manifest: { timestamp: new Date().toISOString(), tool: "vyft" },
      resources: result.state,
      secrets: null,
    };
    await store.save(context, project, state);

    // Simulate an interrupted operation by appending a WAL entry
    await store.appendLog(context, project, {
      type: "pending",
      id: "data",
      operation: "updating",
    });
    ok(await store.hasWAL(context, project));

    // Refresh compacts state, clearing WAL
    const refreshed = refreshState({ v }, state);
    await store.compact(context, project, refreshed);

    strictEqual(await store.hasWAL(context, project), false);
    strictEqual(refreshed.resources.length, 1);
  });

  it("preserves runtime and outputs from previous state", () => {
    const state: PersistedState = {
      version: 1,
      manifest: { timestamp: new Date().toISOString(), tool: "vyft" },
      resources: [
        {
          id: "data",
          kind: "volume",
          fingerprint: fingerprint(vol("data")),
          inputs: {},
          outputs: { mountPath: "/data" },
          dependencies: [],
          runtime: { volumeId: "vol-123" },
          created: "2025-01-01T00:00:00.000Z",
          modified: "2025-01-01T00:00:00.000Z",
          taint: false,
        },
      ],
      secrets: null,
    };

    const v = vol("data");
    const refreshed = refreshState({ v }, state);

    deepStrictEqual(refreshed.resources[0]?.runtime, { volumeId: "vol-123" });
    deepStrictEqual(refreshed.resources[0]?.outputs, { mountPath: "/data" });
  });
});
