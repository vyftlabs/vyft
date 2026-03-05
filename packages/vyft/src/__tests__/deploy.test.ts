import { ok, strictEqual } from "node:assert";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { Change, Operation, Runtime } from "@vyft/core";
import { parseURN } from "@vyft/core";
import type { URN } from "@vyft/primitives";
import { Store } from "@vyft/store";
import { deploy } from "./test-utils.ts";

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

function vol(id: string, config: Record<string, unknown> = {}) {
  return { kind: "volume" as const, id, config };
}

function sec(id: string) {
  return { kind: "variable" as const, id, config: {} };
}

/** Convert ResourceState array to Store-compatible Map. */
function toMap(
  state: { urn: URN; [k: string]: unknown }[],
): Map<URN, (typeof state)[number]> {
  const m = new Map<URN, (typeof state)[number]>();
  for (const s of state) m.set(s.urn, s);
  return m;
}

describe("store + deploy integration", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "vyft-deploy-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("first deploy writes state with all resources", async () => {
    const dir = join(root, "state");
    const runtime = mockRuntime();
    const v = vol("data");
    const s = sec("pass");

    const result = await deploy({ v, s }, [], runtime);

    const store = await Store.open(dir);
    store.state = toMap(result.state) as never;
    await store.checkpoint();
    await store.dispose();

    const store2 = await Store.open(dir);
    strictEqual(store2.state.size, 2);
    ok([...store2.state.values()].some((r) => parseURN(r.urn).id === "data"));
    ok([...store2.state.values()].some((r) => parseURN(r.urn).id === "pass"));
    await store2.dispose();
  });

  it("second deploy with same config produces no changes", async () => {
    const dir = join(root, "state");
    const runtime = mockRuntime();
    const v = vol("data");

    const first = await deploy({ v }, [], runtime);
    const store = await Store.open(dir);
    store.state = toMap(first.state) as never;
    await store.checkpoint();
    await store.dispose();

    const store2 = await Store.open(dir);
    const prevState = [...store2.state.values()];
    const result = await deploy({ v }, prevState, runtime);
    strictEqual(result.state.length, 1);
    strictEqual(result.state[0]?.fingerprint, first.state[0]?.fingerprint);
    await store2.dispose();
  });

  it("second deploy with modified config updates state and preserves created", async () => {
    const dir = join(root, "state");
    const runtime = mockRuntime();
    const v1 = vol("data");

    const first = await deploy({ v: v1 }, [], runtime);
    const store = await Store.open(dir);
    store.state = toMap(first.state) as never;
    await store.checkpoint();
    const originalCreated = first.state[0]?.created;
    await store.dispose();

    const store2 = await Store.open(dir);
    const prevState = [...store2.state.values()];
    const v2 = vol("data", { size: "10Gi" });
    const second = await deploy({ v: v2 }, prevState, runtime);

    strictEqual(second.state.length, 1);
    ok(second.state[0]?.fingerprint !== first.state[0]?.fingerprint);
    strictEqual(second.state[0]?.created, originalCreated);

    ok(originalCreated !== undefined);
    const secondModified = second.state[0]?.modified;
    ok(secondModified !== undefined);
    ok(secondModified >= originalCreated);

    store2.state = toMap(second.state) as never;
    await store2.checkpoint();
    await store2.dispose();

    const store3 = await Store.open(dir);
    const entry = [...store3.state.values()][0];
    strictEqual(entry?.inputs["size"], "10Gi");
    await store3.dispose();
  });

  it("full lock cycle around deploy", async () => {
    const dir = join(root, "state");
    const runtime = mockRuntime();
    const v = vol("data");

    const store = await Store.open(dir);
    const result = await deploy({ v }, [...store.state.values()], runtime);
    store.state = toMap(result.state) as never;
    await store.checkpoint();
    await store.dispose();

    // Can re-open (lock is released)
    const store2 = await Store.open(dir);
    strictEqual(store2.state.size, 1);
    await store2.dispose();
  });
});
