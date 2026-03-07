import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { LocalBackend } from "./backend/local.ts";
import { MemoryBackend } from "./backend/memory.ts";
import type { StorageBackend } from "./backend/types.ts";
import { LockError } from "./error.ts";
import { Store } from "./store.ts";
import { parseWAL } from "./wal.ts";

// ---------------------------------------------------------------------------
// Helper: backend with artificial delay to expose concurrency issues
// ---------------------------------------------------------------------------
class SlowAppendBackend implements StorageBackend {
  readonly #inner = new MemoryBackend();
  readonly #delayMs: number;

  constructor(delayMs: number) {
    this.#delayMs = delayMs;
  }

  read(key: string) {
    return this.#inner.read(key);
  }
  write(key: string, data: string) {
    return this.#inner.write(key, data);
  }
  async append(key: string, data: string): Promise<void> {
    const current = (await this.#inner.read(key)) ?? "";
    await new Promise((r) => setTimeout(r, this.#delayMs));
    await this.#inner.write(key, current + data);
  }
  delete(key: string) {
    return this.#inner.delete(key);
  }
  deleteAll(prefix: string) {
    return this.#inner.deleteAll(prefix);
  }
  lock() {
    return this.#inner.lock();
  }
  unlock() {
    return this.#inner.unlock();
  }
}

// ---------------------------------------------------------------------------
// Bug #1: Lock takeover race — LocalBackend atomicity
// ---------------------------------------------------------------------------
describe("Bug #1: Lock takeover race (LocalBackend)", () => {
  it("second open on the same LocalBackend is rejected", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vyft-bug1-"));
    try {
      const backend = new LocalBackend(dir);
      const store1 = await Store.open(backend);

      await assert.rejects(
        () => Store.open(backend),
        (err: unknown) => err instanceof LockError,
        "Second open must throw LockError",
      );

      await store1.dispose();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Bug #2: Lock errors should always surface as LockError
// ---------------------------------------------------------------------------
describe("Bug #2: Lock errors wrapped as LockError", () => {
  it("raw ENOENT from lock() is wrapped in LockError", async () => {
    let callCount = 0;
    const backend = new MemoryBackend();
    const originalLock = backend.lock.bind(backend);
    backend.lock = async () => {
      callCount++;
      if (callCount === 1) {
        await originalLock();
        return;
      }
      throw new Error("ENOENT: no such file or directory, open 'lock'");
    };

    const store1 = await Store.open(backend);

    await assert.rejects(
      () => Store.open(backend),
      (err: unknown) => {
        assert.equal(
          err instanceof LockError,
          true,
          `Expected LockError but got ${err instanceof Error ? err.constructor.name : "unknown"}`,
        );
        return true;
      },
    );

    await store1.dispose();
  });

  it("SyntaxError from lock() is wrapped in LockError", async () => {
    const backend = new MemoryBackend();
    const originalLock = backend.lock.bind(backend);
    backend.lock = async () => {
      await originalLock().catch(() => {});
      throw new SyntaxError("Unexpected end of JSON input");
    };

    await assert.rejects(
      () => Store.open(backend),
      (err: unknown) => {
        assert.equal(
          err instanceof LockError,
          true,
          `Expected LockError but got ${err instanceof Error ? err.constructor.name : "unknown"}`,
        );
        return true;
      },
    );
  });
});

// ---------------------------------------------------------------------------
// Bug #4: WAL should recover valid entries after mid-file corruption
// ---------------------------------------------------------------------------
describe("Bug #4: WAL recovers valid entries after corruption", () => {
  it("valid entries after a corrupt line are recovered", () => {
    const lines = [
      JSON.stringify({ type: "set", key: "a", data: 1 }),
      JSON.stringify({ type: "set", key: "b", data: 2 }),
      "CORRUPT",
      JSON.stringify({ type: "set", key: "c", data: 3 }),
      JSON.stringify({ type: "set", key: "d", data: 4 }),
    ].join("\n");

    const entries = parseWAL(lines);
    assert.equal(entries.length, 4, "All 4 valid entries should be recovered");
  });

  it("valid entries after corrupt first line are recovered", () => {
    const lines = [
      "CORRUPT FIRST LINE",
      JSON.stringify({ type: "set", key: "a", data: 1 }),
      JSON.stringify({ type: "set", key: "b", data: 2 }),
    ].join("\n");

    const entries = parseWAL(lines);
    assert.equal(
      entries.length,
      2,
      "Entries after corrupt first line are recovered",
    );
  });

  it("full round-trip recovers data after mid-WAL corruption", async () => {
    const backend = new MemoryBackend();

    const wal =
      [
        JSON.stringify({ type: "set", key: "committed", data: "safe" }),
        JSON.stringify({
          type: "set",
          key: "also_committed",
          data: "safe too",
        }),
        "{torn-write",
        JSON.stringify({
          type: "set",
          key: "important",
          data: "must not lose",
        }),
      ].join("\n") + "\n";

    await backend.write("state.json", "{}");
    await backend.write("wal.jsonl", wal);

    const store = await Store.open(backend);
    assert.equal(store.get("committed"), "safe");
    assert.equal(store.get("also_committed"), "safe too");
    assert.equal(store.get("important"), "must not lose");
    assert.equal(store.size, 3);
    await store.dispose();
  });
});

// ---------------------------------------------------------------------------
// Bug #5: Concurrent appends must preserve all WAL entries
// ---------------------------------------------------------------------------
describe("Bug #5: Concurrent appends preserve all WAL entries", () => {
  it("parallel appends are both persisted in the WAL", async () => {
    const backend = new SlowAppendBackend(10);
    const store = await Store.open(backend);

    await Promise.all([
      store.append({ type: "set", key: "x", data: "first" }),
      store.append({ type: "set", key: "x", data: "second" }),
    ]);

    const walRaw = await backend.read("wal.jsonl");
    assert.notEqual(walRaw, null);

    const walEntries = parseWAL(walRaw ?? "");
    assert.equal(walEntries.length, 2, "Both WAL entries must be preserved");

    await store.dispose();
  });
});

// ---------------------------------------------------------------------------
// Bug #6: delete() should not break lock protection
// ---------------------------------------------------------------------------
describe("Bug #6: delete() preserves lock", () => {
  it("another open fails between delete() and dispose()", async () => {
    const backend = new MemoryBackend();
    const store1 = await Store.open(backend);
    await store1.append({ type: "set", key: "k", data: "v" });

    await store1.delete();

    await assert.rejects(
      () => Store.open(backend),
      (err: unknown) => err instanceof LockError,
      "Lock should still be held after delete(), before dispose()",
    );

    await store1.dispose();
  });

  it("delete then dispose then reopen works cleanly", async () => {
    const backend = new MemoryBackend();
    const store1 = await Store.open(backend);
    await store1.append({ type: "set", key: "k", data: "v" });
    await store1.delete();
    await store1.dispose();

    const store2 = await Store.open(backend);
    assert.equal(store2.size, 0, "Store should be empty after delete");
    await store2.dispose();
  });
});

// ---------------------------------------------------------------------------
// Bug #7: undefined data is rejected at append time
// ---------------------------------------------------------------------------
describe("Bug #7: undefined rejected at append", () => {
  it("append rejects undefined data with a clear error", async () => {
    const backend = new MemoryBackend();
    const store = await Store.open(backend);

    await assert.rejects(
      () => store.append({ type: "set", key: "u", data: undefined }),
      (err: unknown) =>
        err instanceof Error &&
        err.message === "Cannot store undefined — use null instead",
    );

    await store.dispose();
  });

  it("null is accepted and persists correctly", async () => {
    const backend = new MemoryBackend();

    const s1 = await Store.open(backend);
    await s1.append({ type: "set", key: "n", data: null });
    assert.equal(s1.has("n"), true);
    assert.equal(s1.get("n"), null);
    await s1.dispose();

    const s2 = await Store.open(backend);
    assert.equal(s2.has("n"), true);
    assert.equal(s2.get("n"), null);
    await s2.dispose();
  });
});
