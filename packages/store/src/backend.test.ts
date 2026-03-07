import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { LocalBackend } from "./backend/local.ts";
import { LockError } from "./error.ts";
import { Store } from "./store.ts";

describe("LocalBackend", () => {
  async function withTmpDir(fn: (dir: string) => Promise<void>): Promise<void> {
    const dir = await mkdtemp(join(tmpdir(), "vyft-test-"));
    try {
      await fn(dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  describe("locking", () => {
    it("prevents concurrent open", async () => {
      await withTmpDir(async (dir) => {
        const backend = new LocalBackend(dir);
        const store1 = await Store.open(backend);

        await assert.rejects(
          () => Store.open(backend),
          (err: unknown) => err instanceof LockError,
        );

        await store1.dispose();
      });
    });

    it("releases lock on dispose, allowing reopen", async () => {
      await withTmpDir(async (dir) => {
        const backend = new LocalBackend(dir);

        const store1 = await Store.open(backend);
        await store1.append({ type: "set", key: "a", data: 1 });
        await store1.dispose();

        const store2 = await Store.open(backend);
        assert.equal(store2.get("a"), 1);
        await store2.dispose();
      });
    });

    it("takes over stale lock from dead process", async () => {
      await withTmpDir(async (dir) => {
        const backend = new LocalBackend(dir);

        // Write a lock file for a PID that doesn't exist
        const { writeFile, mkdir } = await import("node:fs/promises");
        await mkdir(dir, { recursive: true });
        await writeFile(
          join(dir, "lock"),
          JSON.stringify({ pid: 999999, timestamp: new Date().toISOString() }),
        );

        // Should succeed by taking over the stale lock
        const store = await Store.open(backend);
        await store.dispose();
      });
    });
  });
});
