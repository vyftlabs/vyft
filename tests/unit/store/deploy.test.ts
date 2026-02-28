import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { deploy } from "../../../src/engine/index.ts";
import type { Change } from "../../../src/engine/plan.ts";
import type { Operation, Runtime } from "../../../src/runtimes/types.ts";
import { createFileStore } from "../../../src/store/file.ts";
import type { PersistedState } from "../../../src/store/types.ts";

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

describe("store + deploy integration", () => {
  let root: string;
  const context = "default";
  const project = "test-project";

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "vyft-deploy-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("first deploy writes state with all resources", async () => {
    const store = createFileStore(root);
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
    await store.save(context, project, state);

    const loaded = await store.load(context, project);
    ok(loaded !== null);
    strictEqual(loaded?.resources.length, 2);
    strictEqual(loaded?.version, 1);
    ok(loaded?.resources.some((r) => r.id === "data"));
    ok(loaded?.resources.some((r) => r.id === "pass"));
  });

  it("second deploy with same config produces no changes", async () => {
    const store = createFileStore(root);
    const runtime = mockRuntime();
    const v = vol("data");

    // First deploy
    const first = await deploy({ v }, [], runtime);
    const state1: PersistedState = {
      version: 1,
      manifest: { timestamp: new Date().toISOString(), tool: "vyft" },
      resources: first.state,
      secrets: null,
    };
    await store.save(context, project, state1);

    // Second deploy with same config — load previous state
    const previous = await store.load(context, project);
    const result = await deploy({ v }, previous?.resources, runtime);

    // Fingerprints should match, so state should be identical
    strictEqual(result.state.length, 1);
    strictEqual(result.state[0]?.fingerprint, first.state[0]?.fingerprint);
  });

  it("second deploy with modified config updates state and preserves created", async () => {
    const store = createFileStore(root);
    const runtime = mockRuntime();
    const v1 = vol("data");

    // First deploy
    const first = await deploy({ v: v1 }, [], runtime);
    const state1: PersistedState = {
      version: 1,
      manifest: { timestamp: new Date().toISOString(), tool: "vyft" },
      resources: first.state,
      secrets: null,
    };
    await store.save(context, project, state1);
    const originalCreated = first.state[0]?.created;

    // Second deploy with modified config
    const previous = await store.load(context, project);
    const v2 = vol("data", { size: "10Gi" });
    const second = await deploy({ v: v2 }, previous?.resources, runtime);

    // State should be updated
    strictEqual(second.state.length, 1);
    ok(second.state[0]?.fingerprint !== first.state[0]?.fingerprint);

    // created should be preserved
    strictEqual(second.state[0]?.created, originalCreated);

    // modified should be updated
    ok(second.state[0]?.modified >= originalCreated);

    // Save and verify persistence
    const state2: PersistedState = {
      version: 1,
      manifest: { timestamp: new Date().toISOString(), tool: "vyft" },
      resources: second.state,
      secrets: null,
    };
    await store.save(context, project, state2);

    const loaded = await store.load(context, project);
    strictEqual(loaded?.resources[0]?.inputs.size, "10Gi");
  });

  it("preserves secrets from previous state", async () => {
    const store = createFileStore(root);
    const encrypted = { salt: "abc", iv: "def", data: "ghi", tag: "jkl" };

    const state1: PersistedState = {
      version: 1,
      manifest: { timestamp: new Date().toISOString(), tool: "vyft" },
      resources: [],
      secrets: encrypted,
    };
    await store.save(context, project, state1);

    const previous = await store.load(context, project);
    // Simulate a new deploy that preserves secrets
    const state2: PersistedState = {
      version: 1,
      manifest: { timestamp: new Date().toISOString(), tool: "vyft" },
      resources: [],
      secrets: previous?.secrets,
    };
    await store.save(context, project, state2);

    const loaded = await store.load(context, project);
    deepStrictEqual(loaded?.secrets, encrypted);
  });

  it("full lock/unlock cycle around deploy", async () => {
    const store = createFileStore(root);
    const runtime = mockRuntime();
    const v = vol("data");

    const unlock = await store.lock(context, project);
    try {
      const previous = await store.load(context, project);
      const result = await deploy({ v }, previous?.resources ?? [], runtime);

      const state: PersistedState = {
        version: 1,
        manifest: { timestamp: new Date().toISOString(), tool: "vyft" },
        resources: result.state,
        secrets: null,
      };
      await store.save(context, project, state);
    } finally {
      await unlock();
    }

    // Lock file should be gone, so we can lock again
    const unlock2 = await store.lock(context, project);
    await unlock2();
  });
});
