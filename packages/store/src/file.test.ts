import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { createFileStore } from "./file.ts";
import type { PersistedState, ResourceState } from "./types.ts";

function makeState(overrides?: Partial<PersistedState>): PersistedState {
  return {
    version: 1,
    manifest: { timestamp: "2026-02-27T12:00:00Z", tool: "1.0.0" },
    resources: [],
    secrets: null,
    ...overrides,
  };
}

describe("FileStore", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "vyft-test-"));
  });

  it("load returns null for missing state", async () => {
    const store = createFileStore(root);
    strictEqual(await store.load("ctx", "proj"), null);
  });

  it("save + load round-trips state", async () => {
    const store = createFileStore(root);
    const state = makeState({
      resources: [
        {
          id: "db",
          kind: "service",
          fingerprint: "abc",
          inputs: { image: "postgres:17" },
          outputs: { url: "http://db:5432" },
          dependencies: [],
          runtime: { containerId: "xyz" },
          created: "2026-02-27T12:00:00Z",
          modified: "2026-02-27T12:00:00Z",
          taint: false,
        },
      ],
    });
    await store.save("ctx", "proj", state);
    deepStrictEqual(await store.load("ctx", "proj"), state);
  });

  it("save writes valid JSON with trailing newline", async () => {
    const store = createFileStore(root);
    await store.save("ctx", "proj", makeState());
    const raw = await readFile(join(root, "ctx", "proj", "state.json"), "utf8");
    strictEqual(raw.endsWith("\n"), true);
    JSON.parse(raw);
  });

  it("save overwrites existing state", async () => {
    const store = createFileStore(root);
    await store.save("ctx", "proj", makeState());
    const updated = makeState({ version: 2 });
    await store.save("ctx", "proj", updated);
    deepStrictEqual(await store.load("ctx", "proj"), updated);
  });

  it("no tmp file left after save", async () => {
    const store = createFileStore(root);
    await store.save("ctx", "proj", makeState());
    const tmpPath = join(root, "ctx", "proj", ".state.json.tmp");
    try {
      await stat(tmpPath);
      throw new Error("tmp file should not exist");
    } catch (err: unknown) {
      strictEqual((err as NodeJS.ErrnoException).code, "ENOENT");
    }
  });

  it("delete removes the project directory", async () => {
    const store = createFileStore(root);
    await store.save("ctx", "proj", makeState());
    await store.delete("ctx", "proj");
    strictEqual(await store.load("ctx", "proj"), null);
  });

  it("delete is idempotent on missing directory", async () => {
    const store = createFileStore(root);
    await store.delete("ctx", "nonexistent");
  });
});

describe("WAL", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "vyft-wal-"));
  });

  function makeResource(
    id: string,
    kind: ResourceState["kind"] = "volume",
  ): ResourceState {
    return {
      id,
      kind,
      fingerprint: `fp-${id}`,
      inputs: {},
      outputs: {},
      dependencies: [],
      runtime: {},
      created: "2026-02-28T00:00:00Z",
      modified: "2026-02-28T00:00:00Z",
      taint: false,
    };
  }

  it("hasWAL returns false when no WAL exists", async () => {
    const store = createFileStore(root);
    strictEqual(await store.hasWAL("ctx", "proj"), false);
  });

  it("appendLog creates WAL and hasWAL returns true", async () => {
    const store = createFileStore(root);
    await store.appendLog("ctx", "proj", {
      type: "pending",
      id: "data",
      operation: "creating",
    });
    strictEqual(await store.hasWAL("ctx", "proj"), true);
  });

  it("load replays committed WAL entries on top of checkpoint", async () => {
    const store = createFileStore(root);
    const state: PersistedState = {
      version: 1,
      manifest: { timestamp: "2026-02-28T00:00:00Z", tool: "vyft" },
      resources: [makeResource("a")],
      secrets: null,
    };
    await store.save("ctx", "proj", state);

    const newResource = makeResource("b", "secret");
    await store.appendLog("ctx", "proj", {
      type: "committed",
      id: "b",
      state: newResource,
    });

    const loaded = await store.load("ctx", "proj");
    ok(loaded, "state should exist");
    strictEqual(loaded.resources.length, 2);
    ok(loaded.resources.some((r) => r.id === "a"));
    ok(loaded.resources.some((r) => r.id === "b"));
  });

  it("load replays removed WAL entries", async () => {
    const store = createFileStore(root);
    const state: PersistedState = {
      version: 1,
      manifest: { timestamp: "2026-02-28T00:00:00Z", tool: "vyft" },
      resources: [makeResource("a"), makeResource("b")],
      secrets: null,
    };
    await store.save("ctx", "proj", state);

    await store.appendLog("ctx", "proj", { type: "removed", id: "a" });

    const loaded = await store.load("ctx", "proj");
    ok(loaded, "state should exist");
    strictEqual(loaded.resources.length, 1);
    strictEqual(loaded.resources[0]?.id, "b");
  });

  it("compact writes state and removes WAL", async () => {
    const store = createFileStore(root);
    const state: PersistedState = {
      version: 1,
      manifest: { timestamp: "2026-02-28T00:00:00Z", tool: "vyft" },
      resources: [makeResource("a")],
      secrets: null,
    };
    await store.save("ctx", "proj", state);

    await store.appendLog("ctx", "proj", {
      type: "committed",
      id: "b",
      state: makeResource("b"),
    });
    ok(await store.hasWAL("ctx", "proj"));

    const replayed = await store.load("ctx", "proj");
    ok(replayed, "state should exist for compaction");
    await store.compact("ctx", "proj", replayed);

    strictEqual(await store.hasWAL("ctx", "proj"), false);

    const loaded = await store.load("ctx", "proj");
    ok(loaded, "state should exist after compaction");
    strictEqual(loaded.resources.length, 2);
  });

  it("pending WAL entries do not affect loaded resources", async () => {
    const store = createFileStore(root);
    const state: PersistedState = {
      version: 1,
      manifest: { timestamp: "2026-02-28T00:00:00Z", tool: "vyft" },
      resources: [makeResource("a")],
      secrets: null,
    };
    await store.save("ctx", "proj", state);

    await store.appendLog("ctx", "proj", {
      type: "pending",
      id: "a",
      operation: "updating",
    });

    const loaded = await store.load("ctx", "proj");
    ok(loaded, "state should exist");
    strictEqual(loaded.resources.length, 1);
    strictEqual(loaded.resources[0]?.id, "a");
  });
});
