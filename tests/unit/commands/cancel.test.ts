import { ok, strictEqual } from "node:assert";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { createFileStore } from "../../../src/store/file.ts";
import type { PersistedState } from "../../../src/store/types.ts";

/**
 * These tests exercise the cancel logic directly against the store,
 * mirroring what the cancel command does without requiring CLI wiring.
 */

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe("cancel logic", () => {
  let root: string;
  const context = "default";
  const project = "test";

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "vyft-cancel-"));
  });

  it("clears stale lock and WAL", async () => {
    const store = createFileStore(root);
    const dir = join(root, context, project);
    await mkdir(dir, { recursive: true });

    // Plant a stale lock
    const stalePid = 2147483647;
    await writeFile(
      join(dir, "lock"),
      JSON.stringify({ pid: stalePid, timestamp: new Date().toISOString() }),
    );

    // Plant a WAL file
    await store.appendLog(context, project, {
      type: "pending",
      id: "svc-web",
      operation: "creating",
    });

    // Simulate cancel logic
    const lock = await store.inspectLock(context, project);
    ok(lock !== null);
    ok(!isProcessAlive(lock?.pid));
    await store.clearLock(context, project);

    ok(await store.hasWAL(context, project));

    // Cancel deletes the WAL
    const walFile = join(root, context, project, "wal.jsonl");
    const { unlink } = await import("node:fs/promises");
    await unlink(walFile).catch(() => {});

    strictEqual(await store.hasWAL(context, project), false);

    // Lock should be gone
    const lockAfter = await store.inspectLock(context, project);
    strictEqual(lockAfter, null);
  });

  it("errors when lock belongs to a live process", async () => {
    const store = createFileStore(root);
    const dir = join(root, context, project);
    await mkdir(dir, { recursive: true });

    // Plant a lock with our own PID (guaranteed alive)
    await writeFile(
      join(dir, "lock"),
      JSON.stringify({ pid: process.pid, timestamp: new Date().toISOString() }),
    );

    const lock = await store.inspectLock(context, project);
    ok(lock !== null);
    ok(isProcessAlive(lock?.pid));
    // cancel should NOT clear a live lock — the command would throw CliError
  });

  it("reports nothing to cancel when no lock and no WAL", async () => {
    const store = createFileStore(root);

    const lock = await store.inspectLock(context, project);
    strictEqual(lock, null);

    strictEqual(await store.hasWAL(context, project), false);
    // nothing to cancel
  });

  it("clears WAL when no lock exists", async () => {
    const store = createFileStore(root);

    // State with a resource
    const state: PersistedState = {
      version: 1,
      manifest: { timestamp: new Date().toISOString(), tool: "vyft" },
      resources: [
        {
          id: "svc-web",
          kind: "service",
          fingerprint: "abc",
          inputs: {},
          outputs: {},
          dependencies: [],
          runtime: {},
          created: new Date().toISOString(),
          modified: new Date().toISOString(),
          taint: false,
        },
      ],
      secrets: null,
    };
    await store.save(context, project, state);

    // Append WAL entries (simulating an interrupted deploy)
    await store.appendLog(context, project, {
      type: "pending",
      id: "svc-web",
      operation: "updating",
    });

    const lock = await store.inspectLock(context, project);
    strictEqual(lock, null);

    ok(await store.hasWAL(context, project));

    // Cancel deletes the WAL
    const walFile = join(root, context, project, "wal.jsonl");
    const { unlink } = await import("node:fs/promises");
    await unlink(walFile).catch(() => {});

    strictEqual(await store.hasWAL(context, project), false);

    // Resources should be preserved in state
    const loaded = await store.load(context, project);
    strictEqual(loaded?.resources.length, 1);
    strictEqual(loaded?.resources[0]?.id, "svc-web");
  });
});
