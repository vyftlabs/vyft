import { ok, strictEqual } from "node:assert";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { Change, Operation, Runtime } from "@vyft/core";
import { MOUNTABLE } from "@vyft/core";
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

function vol(id: string) {
  return {
    kind: "volume" as const,
    id,
    config: {},
    [MOUNTABLE]: true as const,
  };
}

function sec(id: string) {
  return { kind: "config" as const, id, config: {} };
}

describe("destroy logic", () => {
  let root: string;
  const context = "default";
  const project = "test";
  const stage = "local";

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
    await store.save(context, project, stage, state);

    // Destroy: deploy empty config against existing state
    const previous = await store.load(context, project, stage);
    ok(previous, "state should exist before destroy");
    await deploy({}, previous.resources, runtime);
    await store.delete(context, project, stage);

    // State should be gone
    const loaded = await store.load(context, project, stage);
    strictEqual(loaded, null);
  });

  it("handles already-empty state gracefully", async () => {
    const store = createFileStore(root);
    const loaded = await store.load(context, project, stage);
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
    await store.save(context, project, stage, state);

    const previous = await store.load(context, project, stage);
    ok(previous, "state should exist");
    strictEqual(previous.resources.length, 0);
    // Nothing to destroy
  });
});
