import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryBackend } from "./backend/memory.ts";
import type { StorageBackend } from "./backend/types.ts";
import { LockError, StateCorruptedError, WALCorruptedError } from "./error.ts";
import { Store } from "./store.ts";
import { parseWAL } from "./wal.ts";

function setup() {
  return new MemoryBackend();
}

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

describe("Store", { concurrency: true }, () => {
  describe("open", { concurrency: true }, () => {
    it("opens an empty store", async () => {
      const backend = setup();
      const store = await Store.open(backend);
      assert.equal(store.size, 0);
      assert.equal(store.get("anything"), undefined);
      assert.equal(store.has("anything"), false);
      await store.dispose();
    });

    it("opens with state file but no WAL", async () => {
      const backend = setup();
      await backend.write("state.json", JSON.stringify({ a: 1, b: 2 }));

      const store = await Store.open(backend);
      assert.equal(store.get("a"), 1);
      assert.equal(store.get("b"), 2);
      assert.equal(store.size, 2);
      await store.dispose();
    });

    it("handles state file with empty object", async () => {
      const backend = setup();
      await backend.write("state.json", "{}");

      const store = await Store.open(backend);
      assert.equal(store.size, 0);
      await store.dispose();
    });

    it("throws StateCorruptedError on invalid JSON in state file", async () => {
      const backend = setup();
      await backend.write("state.json", "not json{{{");

      await assert.rejects(
        () => Store.open(backend),
        (err: unknown) => err instanceof StateCorruptedError,
      );
    });

    it("throws StateCorruptedError on wrong schema in state file", async () => {
      const backend = setup();
      await backend.write("state.json", JSON.stringify([1, 2, 3]));

      await assert.rejects(
        () => Store.open(backend),
        (err: unknown) => err instanceof StateCorruptedError,
      );
    });
  });

  describe("WAL replay", { concurrency: true }, () => {
    it("replays WAL entries on open when WAL has uncommitted entries", async () => {
      const backend = setup();
      await backend.write("state.json", JSON.stringify({ existing: "value" }));
      await backend.write(
        "wal.jsonl",
        `${JSON.stringify({ type: "set", key: "new", data: 99 })}\n`,
      );

      const store = await Store.open(backend);
      assert.equal(store.get("existing"), "value");
      assert.equal(store.get("new"), 99);
      assert.equal(store.size, 2);
      await store.dispose();
    });

    it("replays multiple entries in order for same key", async () => {
      const backend = setup();
      await backend.write("state.json", "{}");
      const entries = [
        { type: "set" as const, key: "a", data: 1 },
        { type: "remove" as const, key: "a" },
        { type: "set" as const, key: "a", data: 3 },
      ];
      await backend.write(
        "wal.jsonl",
        `${entries.map((e) => JSON.stringify(e)).join("\n")}\n`,
      );

      const store = await Store.open(backend);
      assert.equal(store.get("a"), 3);
      assert.equal(store.size, 1);
      await store.dispose();
    });

    it("recovers from WAL-only (no state file) after crash before first compaction", async () => {
      const backend = setup();
      await backend.write(
        "wal.jsonl",
        `${[
          JSON.stringify({ type: "set", key: "a", data: 1 }),
          JSON.stringify({ type: "set", key: "b", data: 2 }),
        ].join("\n")}\n`,
      );

      const store = await Store.open(backend);
      assert.equal(store.get("a"), 1);
      assert.equal(store.get("b"), 2);
      assert.equal(store.size, 2);
      await store.dispose();
    });

    it("handles empty WAL file (0 bytes)", async () => {
      const backend = setup();
      await backend.write("state.json", JSON.stringify({ a: 1 }));
      await backend.write("wal.jsonl", "");

      const store = await Store.open(backend);
      assert.equal(store.get("a"), 1);
      await store.dispose();
    });

    it("handles WAL with only whitespace/newlines", async () => {
      const backend = setup();
      await backend.write("state.json", JSON.stringify({ a: 1 }));
      await backend.write("wal.jsonl", "\n\n\n");

      const store = await Store.open(backend);
      assert.equal(store.get("a"), 1);
      await store.dispose();
    });

    it("throws WALCorruptedError on mid-WAL corruption", async () => {
      const backend = setup();
      await backend.write("state.json", "{}");
      const lines = [
        JSON.stringify({ type: "set", key: "a", data: 1 }),
        "CORRUPT LINE",
        JSON.stringify({ type: "set", key: "b", data: 2 }),
      ].join("\n");
      await backend.write("wal.jsonl", `${lines}\n`);

      await assert.rejects(
        () => Store.open(backend),
        (err: unknown) => err instanceof WALCorruptedError,
      );
    });

    it("survives crash after state write but before WAL delete (idempotent replay)", async () => {
      const backend = setup();
      // Simulate a crash that occurred after state.json was atomically written
      // during open() compaction, but before wal.jsonl was deleted.
      // The WAL entries are already reflected in state, so replaying them is idempotent.
      await backend.write("state.json", JSON.stringify({ a: 1, b: 2 }));
      await backend.write(
        "wal.jsonl",
        `${[
          JSON.stringify({ type: "set", key: "a", data: 1 }),
          JSON.stringify({ type: "set", key: "b", data: 2 }),
        ].join("\n")}\n`,
      );

      const store = await Store.open(backend);
      assert.equal(store.get("a"), 1);
      assert.equal(store.get("b"), 2);
      assert.equal(store.size, 2);
      await store.dispose();
    });

    it("tolerates truncated last line (crash recovery)", async () => {
      const backend = setup();
      const wal = `${[
        JSON.stringify({ type: "set", key: "committed", data: "safe" }),
        '{"type":"set","key":"torn","da',
      ].join("\n")}\n`;

      await backend.write("state.json", "{}");
      await backend.write("wal.jsonl", wal);

      const store = await Store.open(backend);
      assert.equal(store.get("committed"), "safe");
      assert.equal(store.has("torn"), false);
      assert.equal(store.size, 1);
      await store.dispose();
    });

    it("throws WALCorruptedError on valid JSON with wrong schema", async () => {
      const backend = setup();
      await backend.write("state.json", "{}");
      await backend.write(
        "wal.jsonl",
        `${JSON.stringify({ type: "unknown", key: "a" })}\n`,
      );

      await assert.rejects(
        () => Store.open(backend),
        (err: unknown) => err instanceof WALCorruptedError,
      );
    });
  });

  describe("get / has / entries", { concurrency: true }, () => {
    it("sets and retrieves a value", async () => {
      const backend = setup();
      const store = await Store.open(backend);
      await store.append({ type: "set", key: "a", data: 42 });
      assert.equal(store.get("a"), 42);
      assert.equal(store.has("a"), true);
      assert.equal(store.size, 1);
      await store.dispose();
    });

    it("removes a key", async () => {
      const backend = setup();
      const store = await Store.open(backend);
      await store.append({ type: "set", key: "a", data: 1 });
      await store.append({ type: "remove", key: "a" });
      assert.equal(store.has("a"), false);
      assert.equal(store.size, 0);
      await store.dispose();
    });

    it("overwrites an existing key", async () => {
      const backend = setup();
      const store = await Store.open(backend);
      await store.append({ type: "set", key: "a", data: 1 });
      await store.append({ type: "set", key: "a", data: 2 });
      assert.equal(store.get("a"), 2);
      assert.equal(store.size, 1);
      await store.dispose();
    });

    it("iterates entries", async () => {
      const backend = setup();
      const store = await Store.open(backend);
      await store.append({ type: "set", key: "a", data: 1 });
      await store.append({ type: "set", key: "b", data: 2 });

      const result = new Map(store.entries());
      assert.equal(result.size, 2);
      assert.equal(result.get("a"), 1);
      assert.equal(result.get("b"), 2);
      await store.dispose();
    });

    it("entries() reflects removals and overwrites", async () => {
      const backend = setup();
      const store = await Store.open(backend);
      await store.append({ type: "set", key: "a", data: 1 });
      await store.append({ type: "set", key: "b", data: 2 });
      await store.append({ type: "set", key: "c", data: 3 });
      await store.append({ type: "remove", key: "b" });
      await store.append({ type: "set", key: "a", data: 10 });

      const result = new Map(store.entries());
      assert.equal(result.size, 2);
      assert.equal(result.get("a"), 10);
      assert.equal(result.has("b"), false);
      assert.equal(result.get("c"), 3);
      await store.dispose();
    });

    it("removing nonexistent key does not throw", async () => {
      const backend = setup();
      const store = await Store.open(backend);
      await store.append({ type: "remove", key: "nope" });
      assert.equal(store.size, 0);
      await store.dispose();
    });

    it("stores null and false values without confusing them with missing", async () => {
      const backend = setup();
      const store = await Store.open(backend);
      await store.append({ type: "set", key: "nil", data: null });
      await store.append({ type: "set", key: "no", data: false });

      assert.equal(store.has("nil"), true);
      assert.equal(store.get("nil"), null);
      assert.equal(store.has("no"), true);
      assert.equal(store.get("no"), false);
      await store.dispose();
    });

    it("rejects undefined data with a clear error", async () => {
      const backend = setup();
      const store = await Store.open(backend);
      await assert.rejects(
        () => store.append({ type: "set", key: "u", data: undefined }),
        (err: unknown) =>
          err instanceof Error &&
          err.message === "Cannot store undefined — use null instead",
      );
      await store.dispose();
    });

    it("handles empty string key", async () => {
      const backend = setup();
      const store = await Store.open(backend);
      await store.append({ type: "set", key: "", data: "empty" });
      assert.equal(store.get(""), "empty");
      assert.equal(store.has(""), true);
      await store.dispose();
    });

    it("stores complex nested values", async () => {
      const backend = setup();
      const store = await Store.open(backend);
      const complex = { nested: { array: [1, { deep: true }] } };
      await store.append({ type: "set", key: "obj", data: complex });
      assert.deepEqual(store.get("obj"), complex);
      await store.dispose();
    });

    it("get() returns defensive copy of objects", async () => {
      const backend = setup();
      const store = await Store.open(backend);
      await store.append({ type: "set", key: "obj", data: { a: 1, b: 2 } });

      const ref = store.get("obj") as Record<string, unknown>;
      ref["a"] = 999;
      ref["c"] = "injected";

      assert.deepEqual(store.get("obj"), { a: 1, b: 2 });
      await store.dispose();
    });

    it("get() returns defensive copy of arrays", async () => {
      const backend = setup();
      const store = await Store.open(backend);
      await store.append({ type: "set", key: "arr", data: [1, 2, 3] });

      const ref = store.get("arr") as number[];
      ref.push(4);
      ref[0] = 999;

      assert.deepEqual(store.get("arr"), [1, 2, 3]);
      await store.dispose();
    });

    it("mutating get() result does not corrupt persisted state", async () => {
      const backend = setup();
      const store = await Store.open(backend);
      await store.append({ type: "set", key: "obj", data: { a: 1 } });

      const ref = store.get("obj") as Record<string, unknown>;
      ref["a"] = 999;
      await store.dispose();

      const store2 = await Store.open(backend);
      assert.deepEqual(store2.get("obj"), { a: 1 });
      await store2.dispose();
    });

    it("entries() returns defensive copies", async () => {
      const backend = setup();
      const store = await Store.open(backend);
      await store.append({ type: "set", key: "obj", data: { a: 1 } });

      for (const [, value] of store.entries()) {
        (value as Record<string, unknown>)["a"] = 999;
      }

      assert.deepEqual(store.get("obj"), { a: 1 });
      await store.dispose();
    });

    it("handles special characters in keys", async () => {
      const backend = setup();
      const store = await Store.open(backend);
      const keys = [
        "key.with.dots",
        "key/with/slashes",
        "key\nwith\nnewlines",
        "日本語",
        "emoji🔑",
      ];
      for (const key of keys) {
        await store.append({ type: "set", key, data: key });
      }
      for (const key of keys) {
        assert.equal(store.get(key), key);
      }
      assert.equal(store.size, keys.length);
      await store.dispose();
    });

    it("concurrent appends preserve all entries", async () => {
      const backend = setup();
      const store = await Store.open(backend);

      await Promise.all([
        store.append({ type: "set", key: "a", data: 1 }),
        store.append({ type: "set", key: "b", data: 2 }),
        store.append({ type: "set", key: "c", data: 3 }),
      ]);

      assert.equal(store.get("a"), 1);
      assert.equal(store.get("b"), 2);
      assert.equal(store.get("c"), 3);
      assert.equal(store.size, 3);
      await store.dispose();
    });

    it("concurrent appends with slow backend preserve all WAL entries", async () => {
      const backend = new SlowAppendBackend(10);
      const store = await Store.open(backend);

      await Promise.all([
        store.append({ type: "set", key: "x", data: "first" }),
        store.append({ type: "set", key: "x", data: "second" }),
      ]);

      const walRaw = await backend.read("wal.jsonl");
      assert.notEqual(walRaw, null);
      const walEntries = parseWAL(walRaw ?? "");
      assert.equal(walEntries.length, 2);
      await store.dispose();
    });
  });

  describe("persistence", { concurrency: true }, () => {
    it("persists data across reopen via WAL replay and compaction", async () => {
      const backend = setup();

      const store1 = await Store.open(backend);
      await store1.append({ type: "set", key: "x", data: "hello" });
      await store1.append({ type: "set", key: "y", data: [1, 2, 3] });
      await store1.dispose();

      const store2 = await Store.open(backend);
      assert.equal(store2.get("x"), "hello");
      assert.deepEqual(store2.get("y"), [1, 2, 3]);
      assert.equal(store2.size, 2);
      await store2.dispose();
    });

    it("compacts on dispose: state file written, WAL cleared", async () => {
      const backend = setup();
      const store = await Store.open(backend);
      await store.append({ type: "set", key: "k", data: "v" });
      await store.dispose();

      const stateRaw = await backend.read("state.json");
      assert.equal(typeof stateRaw, "string");
      const state = JSON.parse(stateRaw as string) as Record<string, unknown>;
      assert.equal(state["k"], "v");

      const walRaw = await backend.read("wal.jsonl");
      assert.equal(walRaw, null);
    });

    it("data persists correctly through multiple open/close cycles", async () => {
      const backend = setup();

      const s1 = await Store.open(backend);
      await s1.append({ type: "set", key: "a", data: 1 });
      await s1.append({ type: "set", key: "b", data: 2 });
      await s1.dispose();

      const s2 = await Store.open(backend);
      assert.equal(s2.size, 2);
      await s2.append({ type: "remove", key: "a" });
      await s2.append({ type: "set", key: "c", data: 3 });
      await s2.dispose();

      const s3 = await Store.open(backend);
      assert.equal(s3.has("a"), false);
      assert.equal(s3.get("b"), 2);
      assert.equal(s3.get("c"), 3);
      assert.equal(s3.size, 2);
      await s3.dispose();
    });

    it("data persists after dispose and reopen", async () => {
      const backend = setup();
      const store = await Store.open(backend);
      await store.append({ type: "set", key: "a", data: 1 });
      await store.dispose();

      const store2 = await Store.open(backend);
      assert.equal(store2.get("a"), 1);
      await store2.dispose();
    });

    it("null values persist correctly across round-trips", async () => {
      const backend = setup();

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

    it("recovers after partial WAL write", async () => {
      const inner = new MemoryBackend();
      let failNext = true;
      const backend: StorageBackend = {
        read: (k) => inner.read(k),
        write: (k, d) => inner.write(k, d),
        delete: (k) => inner.delete(k),
        deleteAll: (p) => inner.deleteAll(p),
        lock: () => inner.lock(),
        unlock: () => inner.unlock(),
        append: async (key: string, data: string) => {
          if (failNext) {
            failNext = false;
            const current = (await inner.read(key)) ?? "";
            await inner.write(key, current + data.slice(0, 20));
            throw new Error("Simulated I/O failure");
          }
          const current = (await inner.read(key)) ?? "";
          await inner.write(key, current + data);
        },
      };

      const store = await Store.open(backend);

      await assert.rejects(() =>
        store.append({ type: "set", key: "a", data: 1 }),
      );

      await store.append({ type: "set", key: "b", data: 2 });
      await store.dispose();

      const store2 = await Store.open(backend);
      assert.equal(store2.has("b"), true);
      assert.equal(store2.get("b"), 2);
      await store2.dispose();
    });
  });

  describe("locking", { concurrency: true }, () => {
    it("prevents concurrent open via lock", async () => {
      const backend = setup();
      const store1 = await Store.open(backend);
      await assert.rejects(
        () => Store.open(backend),
        (err: unknown) => err instanceof LockError,
      );
      await store1.dispose();
    });

    it("releases lock on dispose, allowing reopen", async () => {
      const backend = setup();
      const store1 = await Store.open(backend);
      await store1.append({ type: "set", key: "a", data: 1 });
      await store1.dispose();

      const store2 = await Store.open(backend);
      assert.equal(store2.get("a"), 1);
      assert.equal(store2.size, 1);
      await store2.dispose();
    });

    it("wraps raw errors from lock() in LockError", async () => {
      let callCount = 0;
      const backend = setup();
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
        (err: unknown) => err instanceof LockError,
      );
      await store1.dispose();
    });

    it("wraps SyntaxError from lock() in LockError", async () => {
      const backend = setup();
      const originalLock = backend.lock.bind(backend);
      backend.lock = async () => {
        await originalLock().catch(() => {});
        throw new SyntaxError("Unexpected end of JSON input");
      };

      await assert.rejects(
        () => Store.open(backend),
        (err: unknown) => err instanceof LockError,
      );
    });

    it("releases lock when state read fails during open", async () => {
      const backend = setup();
      await backend.write("state.json", "not json{{{");

      await assert.rejects(
        () => Store.open(backend),
        (err: unknown) => err instanceof StateCorruptedError,
      );

      // Fix the corrupt file, then verify lock was released by reopening
      await backend.write("state.json", "{}");
      const store = await Store.open(backend);
      await store.dispose();
    });

    it("releases lock when WAL read fails during open", async () => {
      const backend = setup();
      await backend.write("state.json", "{}");
      await backend.write(
        "wal.jsonl",
        `${JSON.stringify({ type: "unknown", key: "a" })}\n`,
      );

      await assert.rejects(
        () => Store.open(backend),
        (err: unknown) => err instanceof WALCorruptedError,
      );

      // Lock must be released so a subsequent open can succeed
      await backend.write("wal.jsonl", "");
      const store = await Store.open(backend);
      await store.dispose();
    });

    it("preserves original error when unlock fails during open", async () => {
      const backend = setup();
      await backend.write("state.json", "not json{{{");

      const originalUnlock = backend.unlock.bind(backend);
      backend.unlock = async () => {
        await originalUnlock();
        throw new Error("unlock disk failure");
      };

      await assert.rejects(
        () => Store.open(backend),
        (err: unknown) => err instanceof StateCorruptedError,
      );
    });
  });

  describe("dispose", { concurrency: true }, () => {
    it("calling dispose twice does not throw", async () => {
      const backend = setup();
      const store = await Store.open(backend);
      await store.append({ type: "set", key: "a", data: 1 });
      await store.dispose();
      await store.dispose();
    });

    it("asyncDispose works the same as dispose", async () => {
      const backend = setup();
      {
        await using store = await Store.open(backend);
        await store.append({ type: "set", key: "k", data: "v" });
      }

      const stateRaw = await backend.read("state.json");
      assert.equal(typeof stateRaw, "string");
      const state = JSON.parse(stateRaw as string) as Record<string, unknown>;
      assert.equal(state["k"], "v");
    });

    it("throws on append after dispose", async () => {
      const backend = setup();
      const store = await Store.open(backend);
      await store.dispose();

      await assert.rejects(
        () => store.append({ type: "set", key: "a", data: 1 }),
        (err: unknown) =>
          err instanceof Error && err.message === "Store is disposed",
      );
    });

    it("propagates unlock errors", async () => {
      const backend = setup();
      const originalUnlock = backend.unlock.bind(backend);
      backend.unlock = async () => {
        await originalUnlock();
        const err = new Error("EPERM: operation not permitted");
        (err as NodeJS.ErrnoException).code = "EPERM";
        throw err;
      };

      const store = await Store.open(backend);
      await store.append({ type: "set", key: "a", data: 1 });

      await assert.rejects(
        () => store.dispose(),
        (err: unknown) => err instanceof Error && err.message.includes("EPERM"),
      );
    });

    it("preserves compact error when unlock also fails", async () => {
      const inner = new MemoryBackend();
      const backend: StorageBackend = {
        read: (k) => inner.read(k),
        write: (key: string, data: string) => {
          if (key === "state.json") throw new Error("disk full");
          return inner.write(key, data);
        },
        append: (k, d) => inner.append(k, d),
        delete: (k) => inner.delete(k),
        deleteAll: (p) => inner.deleteAll(p),
        lock: () => inner.lock(),
        unlock: async () => {
          await inner.unlock();
          throw new Error("unlock also failed");
        },
      };

      const store = await Store.open(backend);
      await store.append({ type: "set", key: "a", data: 1 });

      await assert.rejects(
        () => store.dispose(),
        (err: unknown) => err instanceof Error && err.message === "disk full",
      );
    });
  });

  describe("delete", { concurrency: true }, () => {
    it("removes all files and skips compaction on dispose", async () => {
      const backend = setup();
      const store = await Store.open(backend);
      await store.append({ type: "set", key: "k", data: "v" });
      await store.delete();
      await store.dispose();

      const stateRaw = await backend.read("state.json");
      assert.equal(stateRaw, null);
    });

    it("throws on append after delete", async () => {
      const backend = setup();
      const store = await Store.open(backend);
      await store.delete();

      await assert.rejects(
        () => store.append({ type: "set", key: "a", data: 1 }),
        (err: unknown) =>
          err instanceof Error && err.message === "Store is deleted",
      );
      await store.dispose();
    });

    it("works when directory is already gone", async () => {
      const backend = setup();
      const store = await Store.open(backend);
      await store.delete();
      await store.delete();
      await store.dispose();
    });

    it("preserves lock between delete() and dispose()", async () => {
      const backend = setup();
      const store1 = await Store.open(backend);
      await store1.append({ type: "set", key: "k", data: "v" });

      await store1.delete();

      await assert.rejects(
        () => Store.open(backend),
        (err: unknown) => err instanceof LockError,
      );

      await store1.dispose();
    });

    it("delete then dispose then reopen works cleanly", async () => {
      const backend = setup();
      const store1 = await Store.open(backend);
      await store1.append({ type: "set", key: "k", data: "v" });
      await store1.delete();
      await store1.dispose();

      const store2 = await Store.open(backend);
      assert.equal(store2.size, 0);
      await store2.dispose();
    });

    it("delete() should not allow in-flight appends to resurrect data", async () => {
      const backend = new SlowAppendBackend(50);
      const store = await Store.open(backend);

      // Start a slow append — don't await it
      const appendPromise = store.append({
        type: "set",
        key: "zombie",
        data: "should be gone",
      });

      // Delete immediately while append is in-flight
      await store.delete();
      await store.dispose();

      // Wait for the append to settle (it may reject or resolve)
      await appendPromise.catch(() => {});

      // Reopen — the "zombie" key must NOT exist
      const store2 = await Store.open(backend);
      assert.equal(
        store2.has("zombie"),
        false,
        "Data resurrected after delete — delete() did not drain appendQueue",
      );
      assert.equal(store2.size, 0);
      await store2.dispose();
    });
  });

  describe("round-trip integrity", { concurrency: true }, () => {
    it("nested undefined should be normalized on append", async () => {
      const backend = setup();
      const store = await Store.open(backend);

      await store.append({
        type: "set",
        key: "obj",
        data: { a: undefined, b: 1 },
      });

      const before = store.get("obj") as Record<string, unknown>;
      assert.equal(
        "a" in before,
        false,
        "undefined fields should be stripped on append",
      );
      assert.deepEqual(before, { b: 1 });

      await store.dispose();

      const store2 = await Store.open(backend);
      const after = store2.get("obj") as Record<string, unknown>;

      assert.deepEqual(
        before,
        after,
        "Value should be consistent after round-trip",
      );
      await store2.dispose();
    });

    it("NaN should be normalized to null on append", async () => {
      const backend = setup();
      const store = await Store.open(backend);

      await store.append({ type: "set", key: "nan", data: NaN });
      assert.equal(store.get("nan"), null, "NaN should be normalized to null");

      await store.dispose();

      const store2 = await Store.open(backend);
      assert.equal(
        store2.get("nan"),
        null,
        "Should remain null after round-trip",
      );
      await store2.dispose();
    });

    it("open() compaction writes state.json before deleting wal.jsonl", async () => {
      const inner = new MemoryBackend();
      const ops: string[] = [];
      const backend: StorageBackend = {
        read: (k) => inner.read(k),
        write: async (k, d) => {
          ops.push(`write:${k}`);
          return inner.write(k, d);
        },
        append: (k, d) => inner.append(k, d),
        delete: async (k) => {
          ops.push(`delete:${k}`);
          return inner.delete(k);
        },
        deleteAll: (p) => inner.deleteAll(p),
        lock: () => inner.lock(),
        unlock: () => inner.unlock(),
      };
      await inner.write("state.json", JSON.stringify({ a: 1 }));
      await inner.write(
        "wal.jsonl",
        `${JSON.stringify({ type: "set", key: "b", data: 2 })}\n`,
      );

      const store = await Store.open(backend);
      await store.dispose();

      const writeIdx = ops.indexOf("write:state.json");
      const deleteIdx = ops.indexOf("delete:wal.jsonl");
      assert.ok(writeIdx !== -1, "state.json should be written");
      assert.ok(deleteIdx !== -1, "wal.jsonl should be deleted");
      assert.ok(
        writeIdx < deleteIdx,
        "state.json must be written before wal.jsonl is deleted",
      );
    });

    it("dispose() compaction writes state.json before deleting wal.jsonl", async () => {
      const inner = new MemoryBackend();
      const ops: string[] = [];
      const backend: StorageBackend = {
        read: (k) => inner.read(k),
        write: async (k, d) => {
          ops.push(`write:${k}`);
          return inner.write(k, d);
        },
        append: (k, d) => inner.append(k, d),
        delete: async (k) => {
          ops.push(`delete:${k}`);
          return inner.delete(k);
        },
        deleteAll: (p) => inner.deleteAll(p),
        lock: () => inner.lock(),
        unlock: () => inner.unlock(),
      };

      const store = await Store.open(backend);
      await store.append({ type: "set", key: "a", data: 1 });
      ops.length = 0; // reset — only track dispose() operations
      await store.dispose();

      const writeIdx = ops.indexOf("write:state.json");
      const deleteIdx = ops.indexOf("delete:wal.jsonl");
      assert.ok(writeIdx !== -1, "state.json should be written");
      assert.ok(deleteIdx !== -1, "wal.jsonl should be deleted");
      assert.ok(
        writeIdx < deleteIdx,
        "state.json must be written before wal.jsonl is deleted during compaction",
      );
    });

    it("Infinity should be normalized to null on append", async () => {
      const backend = setup();
      const store = await Store.open(backend);

      await store.append({ type: "set", key: "inf", data: Infinity });
      assert.equal(
        store.get("inf"),
        null,
        "Infinity should be normalized to null",
      );

      await store.dispose();

      const store2 = await Store.open(backend);
      assert.equal(
        store2.get("inf"),
        null,
        "Should remain null after round-trip",
      );
      await store2.dispose();
    });

    it("append() snapshots data eagerly before queuing", async () => {
      const backend = setup();
      const store = await Store.open(backend);

      const data = { x: 1, nested: { y: 2 } };
      const promise = store.append({ type: "set", key: "a", data });
      data.x = 999;
      data.nested.y = 999;
      await promise;

      assert.deepEqual(store.get("a"), { x: 1, nested: { y: 2 } });
      await store.dispose();

      const store2 = await Store.open(backend);
      assert.deepEqual(store2.get("a"), { x: 1, nested: { y: 2 } });
      await store2.dispose();
    });

    it("set entry without data in WAL should be rejected", async () => {
      const backend = setup();

      await backend.write("state.json", "{}");
      await backend.write(
        "wal.jsonl",
        `${JSON.stringify({ type: "set", key: "ghost" })}\n`,
      );

      await assert.rejects(
        () => Store.open(backend),
        (err: unknown) => err instanceof WALCorruptedError,
      );
    });
  });
});
