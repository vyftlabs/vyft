import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { Change, Operation, Runtime } from "@vyft/core";
import { deploy } from "@vyft/engine";
import type { PersistedState } from "@vyft/store";
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
  return { kind: "config" as const, id, config: {} };
}

describe("store + deploy integration", () => {
  let root: string;
  const context = "default";
  const project = "test-project";
  const stage = "local";

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
    await store.save(context, project, stage, state);

    const loaded = await store.load(context, project, stage);
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

    const first = await deploy({ v }, [], runtime);
    const state1: PersistedState = {
      version: 1,
      manifest: { timestamp: new Date().toISOString(), tool: "vyft" },
      resources: first.state,
      secrets: null,
    };
    await store.save(context, project, stage, state1);

    const previous = await store.load(context, project, stage);
    const result = await deploy({ v }, previous?.resources ?? [], runtime);

    strictEqual(result.state.length, 1);
    strictEqual(result.state[0]?.fingerprint, first.state[0]?.fingerprint);
  });

  it("second deploy with modified config updates state and preserves created", async () => {
    const store = createFileStore(root);
    const runtime = mockRuntime();
    const v1 = vol("data");

    const first = await deploy({ v: v1 }, [], runtime);
    const state1: PersistedState = {
      version: 1,
      manifest: { timestamp: new Date().toISOString(), tool: "vyft" },
      resources: first.state,
      secrets: null,
    };
    await store.save(context, project, stage, state1);
    const originalCreated = first.state[0]?.created;

    const previous = await store.load(context, project, stage);
    const v2 = vol("data", { size: "10Gi" });
    const second = await deploy({ v: v2 }, previous?.resources ?? [], runtime);

    strictEqual(second.state.length, 1);
    ok(second.state[0]?.fingerprint !== first.state[0]?.fingerprint);

    strictEqual(second.state[0]?.created, originalCreated);

    ok(originalCreated !== undefined);
    const secondModified = second.state[0]?.modified;
    ok(secondModified !== undefined);
    ok(secondModified >= originalCreated);

    const state2: PersistedState = {
      version: 1,
      manifest: { timestamp: new Date().toISOString(), tool: "vyft" },
      resources: second.state,
      secrets: null,
    };
    await store.save(context, project, stage, state2);

    const loaded = await store.load(context, project, stage);
    strictEqual(loaded?.resources[0]?.inputs["size"], "10Gi");
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
    await store.save(context, project, stage, state1);

    const previous = await store.load(context, project, stage);
    const state2: PersistedState = {
      version: 1,
      manifest: { timestamp: new Date().toISOString(), tool: "vyft" },
      resources: [],
      secrets: previous?.secrets ?? null,
    };
    await store.save(context, project, stage, state2);

    const loaded = await store.load(context, project, stage);
    deepStrictEqual(loaded?.secrets, encrypted);
  });

  it("full lock/unlock cycle around deploy", async () => {
    const store = createFileStore(root);
    const runtime = mockRuntime();
    const v = vol("data");

    const unlock = await store.lock(context, project, stage);
    try {
      const previous = await store.load(context, project, stage);
      const result = await deploy({ v }, previous?.resources ?? [], runtime);

      const state: PersistedState = {
        version: 1,
        manifest: { timestamp: new Date().toISOString(), tool: "vyft" },
        resources: result.state,
        secrets: null,
      };
      await store.save(context, project, stage, state);
    } finally {
      await unlock();
    }

    const unlock2 = await store.lock(context, project, stage);
    await unlock2();
  });
});
