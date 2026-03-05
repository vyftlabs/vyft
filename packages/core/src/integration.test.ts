import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import * as engine from "@vyft/engine";
import type { Service, Volume } from "@vyft/primitives";
import { buildURN, INTERNAL, MOUNTABLE } from "@vyft/primitives";
import type { ExtendedRuntime, Operation } from "@vyft/runtime";
import type { ResourceState } from "@vyft/store";
import { Store } from "@vyft/store";

// ── Resource helpers ─────────────────────────────────────────────────

function vol(id: string): Volume {
  return {
    kind: "volume",
    id,
    urn: buildURN("platform", "default", "volume", id),
    config: {},
    [MOUNTABLE]: true,
  } as Volume;
}

function svc(
  id: string,
  image: string,
  opts?: { mounts?: Volume[]; env?: Record<string, string> },
): Service {
  const config: Record<string, unknown> = { image, port: 3000 };
  if (opts?.mounts) {
    config["mounts"] = opts.mounts.map((v) => ({
      source: v,
      path: `/mnt/${v.id}`,
    }));
  }
  if (opts?.env) {
    config["env"] = opts.env;
  }
  return {
    kind: "service",
    id,
    urn: buildURN("runtime", "default", "service", id),
    config,
    host: id,
    port: 3000,
    url: `http://${id}:3000`,
    [INTERNAL]: { ready: async () => {} },
  } as unknown as Service;
}

// ── Mock ExtendedRuntime ─────────────────────────────────────────────

function mockRuntime(): ExtendedRuntime & { ops: Operation[] } {
  const ops: Operation[] = [];
  const containerIds = new Map<string, Record<string, unknown>>();
  return {
    ops,
    async execute(op: Operation): Promise<void> {
      ops.push(op);
      if (op.action !== "remove" && op.resource.kind === "service") {
        containerIds.set(op.resource.id, {
          containerId: `cid-${op.resource.id}`,
        });
      }
      if (op.action === "remove") {
        containerIds.delete(op.id);
      }
    },
    async finalize(): Promise<void> {},
    async teardown(): Promise<void> {},
    runtimeState(): Map<string, Record<string, unknown>> {
      return containerIds;
    },
  };
}

// ── Bridge: Change → Operation ───────────────────────────────────────

function toOperation(change: engine.Change): Operation {
  if (change.status === "remove") {
    const parts = change.urn.split(":");
    return {
      action: "remove",
      urn: change.urn,
      id: parts.at(-1) as string,
      kind: parts.at(-2) as string,
    };
  }
  return {
    action: change.status === "create" ? "create" : "update",
    resource: change.resource,
  };
}

// ── executePlan — mirrors core/orchestrate.ts ────────────────────────

async function executePlan(
  changes: engine.Change[][],
  store: Store,
  runtime: ExtendedRuntime,
): Promise<void> {
  for (const level of changes) {
    await Promise.all(
      level.map(async (change) => {
        const urn =
          change.status === "remove"
            ? change.urn
            : engine.resourceURN(change.resource);

        await store.append({
          type: "pending",
          urn,
          action:
            change.status === "create"
              ? "creating"
              : change.status === "modify"
                ? "updating"
                : "deleting",
        });

        await engine.execute(change, async (c) => {
          await runtime.execute(toOperation(c));
        });

        if (change.status === "remove") {
          await store.append({ type: "removed", urn });
        } else {
          await store.append({
            type: "committed",
            urn,
            fingerprint: engine.fingerprint(change.resource),
            inputs: engine.serializeConfig(
              change.resource.kind === "provider"
                ? (change.resource.input as object)
                : (change.resource.config as object),
            ),
            outputs: runtime.runtimeState().get(change.resource.id) ?? {},
          });
        }
      }),
    );
  }
}

// ── Tests ────────────────────────────────────────────────────────────

describe("core integration: engine + store + runtime", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vyft-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("deploy creates resources and persists state", async () => {
    const store = await Store.open(dir);
    const rt = mockRuntime();

    const data = vol("data");
    const api = svc("api", "node:20");
    const resources = [data, api];

    const changes = engine.plan(resources, [...store.state.values()]);
    strictEqual(changes.flat().length, 2);

    await executePlan(changes, store, rt);
    await store.checkpoint();
    await store.dispose();

    // Verify state persisted
    const store2 = await Store.open(dir);
    strictEqual(store2.state.size, 2);
    ok(store2.state.has(buildURN("platform", "default", "volume", "data")));
    ok(store2.state.has(buildURN("runtime", "default", "service", "api")));

    // Verify runtime outputs in state
    const apiState = store2.state.get(
      buildURN("runtime", "default", "service", "api"),
    ) as NonNullable<ReturnType<typeof store2.state.get>>;
    deepStrictEqual(apiState.outputs, { containerId: "cid-api" });

    await store2.dispose();
  });

  it("no-op when state matches desired", async () => {
    // First deploy
    const store = await Store.open(dir);
    const rt = mockRuntime();
    const api = svc("api", "node:20");

    const changes = engine.plan([api], [...store.state.values()]);
    await executePlan(changes, store, rt);
    await store.checkpoint();
    await store.dispose();

    // Second deploy — same resources
    const store2 = await Store.open(dir);
    const changes2 = engine.plan([api], [...store2.state.values()]);
    strictEqual(changes2.length, 0);
    await store2.dispose();
  });

  it("modify updates state and replans correctly", async () => {
    // Deploy v1
    const store = await Store.open(dir);
    const rt = mockRuntime();
    const apiV1 = svc("api", "node:18");

    const c1 = engine.plan([apiV1], [...store.state.values()]);
    await executePlan(c1, store, rt);
    await store.checkpoint();
    await store.dispose();

    // Deploy v2
    const store2 = await Store.open(dir);
    const apiV2 = svc("api", "node:20");
    const c2 = engine.plan([apiV2], [...store2.state.values()]);

    strictEqual(c2.flat().length, 1);
    strictEqual(c2.flat()[0]?.status, "modify");

    await executePlan(c2, store2, rt);
    await store2.checkpoint();

    // Verify updated fingerprint
    const urn = buildURN("runtime", "default", "service", "api");
    const s = store2.state.get(urn) as NonNullable<
      ReturnType<typeof store2.state.get>
    >;
    strictEqual(s.fingerprint, engine.fingerprint(apiV2));
    strictEqual((s.inputs as Record<string, unknown>)["image"], "node:20");

    await store2.dispose();
  });

  it("remove deletes from state", async () => {
    // Deploy two resources
    const store = await Store.open(dir);
    const rt = mockRuntime();
    const data = vol("data");
    const api = svc("api", "node:20");

    const c1 = engine.plan([data, api], [...store.state.values()]);
    await executePlan(c1, store, rt);
    await store.checkpoint();
    await store.dispose();

    // Remove data — deploy only api
    const store2 = await Store.open(dir);
    const c2 = engine.plan([api], [...store2.state.values()]);
    const flat = c2.flat();
    strictEqual(flat.length, 1);
    strictEqual(flat[0]?.status, "remove");

    await executePlan(c2, store2, rt);
    await store2.checkpoint();

    strictEqual(store2.state.size, 1);
    ok(!store2.state.has(buildURN("platform", "default", "volume", "data")));
    ok(store2.state.has(buildURN("runtime", "default", "service", "api")));

    await store2.dispose();
  });

  it("destroy removes all resources", async () => {
    const store = await Store.open(dir);
    const rt = mockRuntime();
    const data = vol("data");
    const api = svc("api", "node:20");

    const c1 = engine.plan([data, api], [...store.state.values()]);
    await executePlan(c1, store, rt);
    await store.checkpoint();
    await store.dispose();

    // Destroy — empty desired
    const store2 = await Store.open(dir);
    strictEqual(store2.state.size, 2);

    const c2 = engine.plan([], [...store2.state.values()]);
    strictEqual(c2.flat().length, 2);
    ok(c2.flat().every((c) => c.status === "remove"));

    await executePlan(c2, store2, rt);
    await store2.checkpoint();
    strictEqual(store2.state.size, 0);

    await store2.dispose();
  });

  it("WAL recovery: crash after pending, before committed", async () => {
    // Deploy api
    const store = await Store.open(dir);
    const rt = mockRuntime();
    const api = svc("api", "node:20");
    const c1 = engine.plan([api], [...store.state.values()]);
    await executePlan(c1, store, rt);
    await store.checkpoint();
    await store.dispose();

    // Simulate crash: write pending to WAL but NOT committed
    const store2 = await Store.open(dir);
    const apiV2 = svc("api", "node:22");
    const c2 = engine.plan([apiV2], [...store2.state.values()]);
    strictEqual(c2.flat().length, 1);

    // Only write the pending entry (simulating crash mid-operation)
    const urn = engine.resourceURN(apiV2);
    await store2.append({ type: "pending", urn, action: "updating" });
    // DO NOT checkpoint — dispose without clean shutdown
    await store2.dispose();

    // Reopen — WAL replays, pending doesn't affect state
    const store3 = await Store.open(dir);
    strictEqual(store3.state.size, 1);
    const recovered = store3.state.get(
      buildURN("runtime", "default", "service", "api"),
    ) as NonNullable<ReturnType<typeof store3.state.get>>;
    // State should still have the OLD fingerprint (v1), not v2
    strictEqual(recovered.fingerprint, engine.fingerprint(api));
    strictEqual(
      (recovered.inputs as Record<string, unknown>)["image"],
      "node:20",
    );

    // Retry the deploy — should plan the modify again
    const c3 = engine.plan([apiV2], [...store3.state.values()]);
    strictEqual(c3.flat().length, 1);
    strictEqual(c3.flat()[0]?.status, "modify");

    await store3.dispose();
  });

  it("WAL recovery: crash after committed, before checkpoint", async () => {
    const store = await Store.open(dir);
    const rt = mockRuntime();
    const api = svc("api", "node:20");

    // Write WAL entries but skip checkpoint
    const changes = engine.plan([api], [...store.state.values()]);
    await executePlan(changes, store, rt);
    // DO NOT checkpoint
    await store.dispose();

    // Reopen — WAL replays committed entries into state
    const store2 = await Store.open(dir);
    strictEqual(store2.state.size, 1);
    ok(store2.state.has(buildURN("runtime", "default", "service", "api")));

    // No changes needed — WAL recovered the state
    const c2 = engine.plan([api], [...store2.state.values()]);
    strictEqual(c2.length, 0);

    await store2.dispose();
  });

  it("dependency ordering preserved through store round-trip", async () => {
    const store = await Store.open(dir);
    const rt = mockRuntime();

    const data = vol("data");
    const api = svc("api", "node:20", { mounts: [data] });

    const changes = engine.plan([data, api], [...store.state.values()]);
    // Volume must come before service
    ok(changes.length >= 2);
    await executePlan(changes, store, rt);
    await store.checkpoint();
    await store.dispose();

    // Modify both — ordering should still hold
    const store2 = await Store.open(dir);
    const apiV2 = svc("api", "node:22", { mounts: [data] });
    const c2 = engine.plan([data, apiV2], [...store2.state.values()]);

    // Only api changed (data config is the same)
    strictEqual(c2.flat().length, 1);
    strictEqual(c2.flat()[0]?.status, "modify");

    await store2.dispose();
  });

  it("full lifecycle: create → modify → remove with state persistence", async () => {
    const rt = mockRuntime();

    // 1. Create
    const store1 = await Store.open(dir);
    const apiV1 = svc("api", "node:18");
    const c1 = engine.plan([apiV1], [...store1.state.values()]);
    await executePlan(c1, store1, rt);
    await store1.checkpoint();
    await store1.dispose();

    // 2. Modify
    const store2 = await Store.open(dir);
    const apiV2 = svc("api", "node:20");
    const c2 = engine.plan([apiV2], [...store2.state.values()]);
    strictEqual(c2.flat()[0]?.status, "modify");
    await executePlan(c2, store2, rt);
    await store2.checkpoint();
    await store2.dispose();

    // 3. Remove
    const store3 = await Store.open(dir);
    const c3 = engine.plan([], [...store3.state.values()]);
    strictEqual(c3.flat()[0]?.status, "remove");
    await executePlan(c3, store3, rt);
    await store3.checkpoint();
    strictEqual(store3.state.size, 0);
    await store3.dispose();

    // 4. Verify empty state persisted
    const store4 = await Store.open(dir);
    strictEqual(store4.state.size, 0);
    await store4.dispose();

    // Verify runtime saw all 3 operations in order
    strictEqual(rt.ops.length, 3);
    strictEqual(rt.ops[0]?.action, "create");
    strictEqual(rt.ops[1]?.action, "update");
    strictEqual(rt.ops[2]?.action, "remove");
  });

  it("tainted resources force update even when fingerprint matches", async () => {
    const store = await Store.open(dir);
    const rt = mockRuntime();
    const api = svc("api", "node:20");

    const c1 = engine.plan([api], [...store.state.values()]);
    await executePlan(c1, store, rt);
    await store.checkpoint();
    await store.dispose();

    // Reopen — same config but tainted
    const store2 = await Store.open(dir);
    const c2 = engine.plan([api], [...store2.state.values()], new Set(["api"]));
    strictEqual(c2.flat().length, 1);
    strictEqual(c2.flat()[0]?.status, "modify");

    await executePlan(c2, store2, rt);
    await store2.checkpoint();
    await store2.dispose();
  });

  it("state.json reflects committed state on disk", async () => {
    const store = await Store.open(dir);
    const rt = mockRuntime();
    const api = svc("api", "node:20");

    const c1 = engine.plan([api], [...store.state.values()]);
    await executePlan(c1, store, rt);
    await store.checkpoint();
    await store.dispose();

    // Read state.json directly from disk
    const raw = await readFile(join(dir, "state.json"), "utf8");
    const arr = JSON.parse(raw) as ResourceState[];
    strictEqual(arr.length, 1);
    strictEqual(arr[0]?.urn, buildURN("runtime", "default", "service", "api"));
    strictEqual(
      (arr[0]?.inputs as Record<string, unknown>)["image"],
      "node:20",
    );
    deepStrictEqual(arr[0]?.outputs, { containerId: "cid-api" });
  });

  it("concurrent level execution with WAL", async () => {
    const store = await Store.open(dir);
    const rt = mockRuntime();

    // Three independent services — should all be in level 1
    const a = svc("a", "node:20");
    const b = svc("b", "node:20");
    const c = svc("c", "node:20");

    const changes = engine.plan([a, b, c], [...store.state.values()]);
    // All in same level (no deps)
    strictEqual(changes.length, 1);
    strictEqual(changes[0]?.length, 3);

    await executePlan(changes, store, rt);
    await store.checkpoint();

    strictEqual(store.state.size, 3);
    strictEqual(rt.ops.length, 3);

    await store.dispose();
  });
});
