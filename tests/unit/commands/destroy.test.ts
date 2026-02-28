import { ok, strictEqual } from "node:assert";
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

function vol(id: string) {
  return { kind: "volume" as const, id, config: {} };
}

function sec(id: string) {
  return { kind: "secret" as const, id, config: {} };
}

describe("destroy logic", () => {
  let root: string;
  const context = "default";
  const project = "test";

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "vyft-destroy-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("removes all resources by deploying empty config", async () => {
    const store = createFileStore(root);
    const runtime = mockRuntime();

    // Deploy some resources
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

    // Destroy: deploy empty config against existing state
    const previous = await store.load(context, project);
    ok(previous, "state should exist before destroy");
    await deploy({}, previous.resources, runtime);
    await store.delete(context, project);

    // State should be gone
    const loaded = await store.load(context, project);
    strictEqual(loaded, null);
  });

  it("handles already-empty state gracefully", async () => {
    const store = createFileStore(root);
    const loaded = await store.load(context, project);
    // No state file — nothing to destroy
    strictEqual(loaded, null);
  });

  it("handles state with zero resources", async () => {
    const store = createFileStore(root);
    const state: PersistedState = {
      version: 1,
      manifest: { timestamp: new Date().toISOString(), tool: "vyft" },
      resources: [],
      secrets: null,
    };
    await store.save(context, project, state);

    const previous = await store.load(context, project);
    ok(previous, "state should exist");
    strictEqual(previous.resources.length, 0);
    // Nothing to destroy
  });
});
