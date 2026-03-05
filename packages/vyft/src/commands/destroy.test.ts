import { ok, strictEqual } from "node:assert";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { Change, Operation, ResourceState, Runtime } from "@vyft/core";
import { MOUNTABLE, parseURN } from "@vyft/core";
import type { URN } from "@vyft/primitives";
import { Store } from "@vyft/store";
import { deploy } from "../__tests__/test-utils.ts";

function mockRuntime(): Runtime {
  return {
    plan(change: Change): Operation[] {
      if (change.status === "remove") {
        const { id, resource: kind } = parseURN(change.urn);
        return [
          {
            action: "remove" as const,
            urn: change.urn,
            id,
            kind: kind as Extract<Operation, { action: "remove" }>["kind"],
          },
        ];
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
  return { kind: "variable" as const, id, config: {} };
}

function toMap(state: ResourceState[]): Map<URN, ResourceState> {
  const m = new Map<URN, ResourceState>();
  for (const s of state) m.set(s.urn, s);
  return m;
}

describe("destroy logic", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "vyft-destroy-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("removes all resources by deploying empty config", async () => {
    const dir = join(root, "state");
    const runtime = mockRuntime();

    // Deploy some resources
    const v = vol("data");
    const s = sec("pass");
    const result = await deploy({ v, s }, [], runtime);

    // Write state via Store
    const store = await Store.open(dir);
    store.state = toMap(result.state);
    await store.checkpoint();
    await store.dispose();

    // Destroy: deploy empty config against existing state
    const store2 = await Store.open(dir);
    ok(store2.state.size > 0, "state should exist before destroy");
    await deploy({}, [...store2.state.values()], runtime);
    await store2.delete();
    await store2.dispose();

    // State should be gone — opening should give empty state
    const store3 = await Store.open(dir);
    strictEqual(store3.state.size, 0);
    await store3.dispose();
  });

  it("handles already-empty state gracefully", async () => {
    const dir = join(root, "state");
    const store = await Store.open(dir);
    strictEqual(store.state.size, 0);
    await store.dispose();
  });

  it("handles state with zero resources", async () => {
    const dir = join(root, "state");
    const store = await Store.open(dir);
    store.state = new Map();
    await store.checkpoint();
    await store.dispose();

    const store2 = await Store.open(dir);
    strictEqual(store2.state.size, 0);
    await store2.dispose();
  });
});
