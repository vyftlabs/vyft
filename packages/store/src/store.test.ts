import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, type TestContext } from "node:test";
import { LockError, StateCorruptedError, WALCorruptedError } from "./error.ts";
import { nodeFs } from "./fs/node.ts";
import type { FileSystem } from "./fs/types.ts";
import { Store } from "./store.ts";

async function setup(t: TestContext) {
  const dir = await mkdtemp(join(tmpdir(), "vyft-store-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

function seedFile(fs: FileSystem, path: string, content: string) {
  return fs.writeFile(path, content, "utf8");
}

describe("Store", { concurrency: true }, () => {
  describe("open", { concurrency: true }, () => {
    it("opens an empty store", async (t) => {
      const dir = await setup(t);
      const store = await Store.open(dir, nodeFs);
      assert.equal(store.size, 0);
      assert.equal(store.get("anything"), undefined);
      assert.equal(store.has("anything"), false);
      await store.dispose();
    });

    it("opens with state file but no WAL", async (t) => {
      const dir = await setup(t);
      await seedFile(
        nodeFs,
        join(dir, "state.json"),
        JSON.stringify({ a: 1, b: 2 }),
      );

      const store = await Store.open(dir, nodeFs);
      assert.equal(store.get("a"), 1);
      assert.equal(store.get("b"), 2);
      assert.equal(store.size, 2);
      await store.dispose();
    });

    it("handles state file with empty object", async (t) => {
      const dir = await setup(t);
      await seedFile(nodeFs, join(dir, "state.json"), "{}");

      const store = await Store.open(dir, nodeFs);
      assert.equal(store.size, 0);
      await store.dispose();
    });

    it("throws StateCorruptedError on invalid JSON in state file", async (t) => {
      const dir = await setup(t);
      await seedFile(nodeFs, join(dir, "state.json"), "not json{{{");

      await assert.rejects(
        () => Store.open(dir, nodeFs),
        (err: unknown) => err instanceof StateCorruptedError,
      );
    });

    it("throws StateCorruptedError on wrong schema in state file", async (t) => {
      const dir = await setup(t);
      await seedFile(
        nodeFs,
        join(dir, "state.json"),
        JSON.stringify([1, 2, 3]),
      );

      await assert.rejects(
        () => Store.open(dir, nodeFs),
        (err: unknown) => err instanceof StateCorruptedError,
      );
    });
  });

  describe("WAL replay", { concurrency: true }, () => {
    it("replays WAL entries on open when WAL has uncommitted entries", async (t) => {
      const dir = await setup(t);

      await seedFile(
        nodeFs,
        join(dir, "state.json"),
        JSON.stringify({ existing: "value" }),
      );
      await seedFile(
        nodeFs,
        join(dir, "wal.jsonl"),
        `${JSON.stringify({ type: "set", key: "new", data: 99 })}\n`,
      );

      const store = await Store.open(dir, nodeFs);
      assert.equal(store.get("existing"), "value");
      assert.equal(store.get("new"), 99);
      assert.equal(store.size, 2);
      await store.dispose();
    });

    it("replays multiple entries in order for same key", async (t) => {
      const dir = await setup(t);
      await seedFile(nodeFs, join(dir, "state.json"), "{}");
      const entries = [
        { type: "set" as const, key: "a", data: 1 },
        { type: "remove" as const, key: "a" },
        { type: "set" as const, key: "a", data: 3 },
      ];
      await seedFile(
        nodeFs,
        join(dir, "wal.jsonl"),
        `${entries.map((e) => JSON.stringify(e)).join("\n")}\n`,
      );

      const store = await Store.open(dir, nodeFs);
      assert.equal(store.get("a"), 3);
      assert.equal(store.size, 1);
      await store.dispose();
    });

    it("recovers from WAL-only (no state file) after crash before first compaction", async (t) => {
      const dir = await setup(t);
      await seedFile(
        nodeFs,
        join(dir, "wal.jsonl"),
        `${[
          JSON.stringify({ type: "set", key: "a", data: 1 }),
          JSON.stringify({ type: "set", key: "b", data: 2 }),
        ].join("\n")}\n`,
      );

      const store = await Store.open(dir, nodeFs);
      assert.equal(store.get("a"), 1);
      assert.equal(store.get("b"), 2);
      assert.equal(store.size, 2);
      await store.dispose();
    });

    it("handles empty WAL file (0 bytes)", async (t) => {
      const dir = await setup(t);
      await seedFile(nodeFs, join(dir, "state.json"), JSON.stringify({ a: 1 }));
      await seedFile(nodeFs, join(dir, "wal.jsonl"), "");

      const store = await Store.open(dir, nodeFs);
      assert.equal(store.get("a"), 1);
      await store.dispose();
    });

    it("handles WAL with only whitespace/newlines", async (t) => {
      const dir = await setup(t);
      await seedFile(nodeFs, join(dir, "state.json"), JSON.stringify({ a: 1 }));
      await seedFile(nodeFs, join(dir, "wal.jsonl"), "\n\n\n");

      const store = await Store.open(dir, nodeFs);
      assert.equal(store.get("a"), 1);
      await store.dispose();
    });

    it("silently drops entries after a malformed JSON line", async (t) => {
      const dir = await setup(t);
      await seedFile(nodeFs, join(dir, "state.json"), "{}");
      const lines = [
        JSON.stringify({ type: "set", key: "a", data: 1 }),
        "CORRUPT LINE",
        JSON.stringify({ type: "set", key: "b", data: 2 }),
      ].join("\n");
      await seedFile(nodeFs, join(dir, "wal.jsonl"), `${lines}\n`);

      const store = await Store.open(dir, nodeFs);
      assert.equal(store.get("a"), 1);
      assert.equal(store.has("b"), false);
      assert.equal(store.size, 1);
      await store.dispose();
    });

    it("throws WALCorruptedError on valid JSON with wrong schema", async (t) => {
      const dir = await setup(t);
      await seedFile(nodeFs, join(dir, "state.json"), "{}");
      await seedFile(
        nodeFs,
        join(dir, "wal.jsonl"),
        `${JSON.stringify({ type: "unknown", key: "a" })}\n`,
      );

      await assert.rejects(
        () => Store.open(dir, nodeFs),
        (err: unknown) => err instanceof WALCorruptedError,
      );
    });
  });

  describe("get / has / entries", { concurrency: true }, () => {
    it("sets and retrieves a value", async (t) => {
      const dir = await setup(t);
      const store = await Store.open(dir, nodeFs);
      await store.append({ type: "set", key: "a", data: 42 });
      assert.equal(store.get("a"), 42);
      assert.equal(store.has("a"), true);
      assert.equal(store.size, 1);
      await store.dispose();
    });

    it("removes a key", async (t) => {
      const dir = await setup(t);
      const store = await Store.open(dir, nodeFs);
      await store.append({ type: "set", key: "a", data: 1 });
      await store.append({ type: "remove", key: "a" });
      assert.equal(store.has("a"), false);
      assert.equal(store.size, 0);
      await store.dispose();
    });

    it("overwrites an existing key", async (t) => {
      const dir = await setup(t);
      const store = await Store.open(dir, nodeFs);
      await store.append({ type: "set", key: "a", data: 1 });
      await store.append({ type: "set", key: "a", data: 2 });
      assert.equal(store.get("a"), 2);
      assert.equal(store.size, 1);
      await store.dispose();
    });

    it("iterates entries", async (t) => {
      const dir = await setup(t);
      const store = await Store.open(dir, nodeFs);
      await store.append({ type: "set", key: "a", data: 1 });
      await store.append({ type: "set", key: "b", data: 2 });

      const result = new Map(store.entries());
      assert.equal(result.size, 2);
      assert.equal(result.get("a"), 1);
      assert.equal(result.get("b"), 2);
      await store.dispose();
    });

    it("entries() reflects removals and overwrites", async (t) => {
      const dir = await setup(t);
      const store = await Store.open(dir, nodeFs);
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

    it("removing nonexistent key does not throw", async (t) => {
      const dir = await setup(t);
      const store = await Store.open(dir, nodeFs);
      await store.append({ type: "remove", key: "nope" });
      assert.equal(store.size, 0);
      await store.dispose();
    });

    it("stores null and false values without confusing them with missing", async (t) => {
      const dir = await setup(t);
      const store = await Store.open(dir, nodeFs);
      await store.append({ type: "set", key: "nil", data: null });
      await store.append({ type: "set", key: "no", data: false });

      assert.equal(store.has("nil"), true);
      assert.equal(store.get("nil"), null);
      assert.equal(store.has("no"), true);
      assert.equal(store.get("no"), false);
      await store.dispose();
    });

    it("set(key, undefined) is distinguishable via has()", async (t) => {
      const dir = await setup(t);
      const store = await Store.open(dir, nodeFs);
      await store.append({ type: "set", key: "u", data: undefined });
      assert.equal(store.has("u"), true);
      assert.equal(store.get("u"), undefined);
      assert.equal(store.has("missing"), false);
      assert.equal(store.get("missing"), undefined);
      await store.dispose();
    });

    it("handles empty string key", async (t) => {
      const dir = await setup(t);
      const store = await Store.open(dir, nodeFs);
      await store.append({ type: "set", key: "", data: "empty" });
      assert.equal(store.get(""), "empty");
      assert.equal(store.has(""), true);
      await store.dispose();
    });

    it("stores complex nested values", async (t) => {
      const dir = await setup(t);
      const store = await Store.open(dir, nodeFs);
      const complex = { nested: { array: [1, { deep: true }] } };
      await store.append({ type: "set", key: "obj", data: complex });
      assert.deepEqual(store.get("obj"), complex);
      await store.dispose();
    });

    it("handles special characters in keys", async (t) => {
      const dir = await setup(t);
      const store = await Store.open(dir, nodeFs);
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

    it("concurrent appends preserve all entries", async (t) => {
      const dir = await setup(t);
      const store = await Store.open(dir, nodeFs);

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
  });

  describe("persistence", { concurrency: true }, () => {
    it("persists data across reopen via WAL replay and compaction", async (t) => {
      const dir = await setup(t);

      const store1 = await Store.open(dir, nodeFs);
      await store1.append({ type: "set", key: "x", data: "hello" });
      await store1.append({ type: "set", key: "y", data: [1, 2, 3] });
      await store1.dispose();

      const store2 = await Store.open(dir, nodeFs);
      assert.equal(store2.get("x"), "hello");
      assert.deepEqual(store2.get("y"), [1, 2, 3]);
      assert.equal(store2.size, 2);
      await store2.dispose();
    });

    it("compacts on dispose: state file written, WAL cleared", async (t) => {
      const dir = await setup(t);
      const store = await Store.open(dir, nodeFs);
      await store.append({ type: "set", key: "k", data: "v" });
      await store.dispose();

      const stateRaw = await readFile(join(dir, "state.json"), "utf8");
      const state = JSON.parse(stateRaw) as Record<string, unknown>;
      assert.equal(state["k"], "v");

      await assert.rejects(
        () => readFile(join(dir, "wal.jsonl"), "utf8"),
        (err: NodeJS.ErrnoException) => err.code === "ENOENT",
      );
    });

    it("data persists correctly through multiple open/close cycles", async (t) => {
      const dir = await setup(t);

      const s1 = await Store.open(dir, nodeFs);
      await s1.append({ type: "set", key: "a", data: 1 });
      await s1.append({ type: "set", key: "b", data: 2 });
      await s1.dispose();

      const s2 = await Store.open(dir, nodeFs);
      assert.equal(s2.size, 2);
      await s2.append({ type: "remove", key: "a" });
      await s2.append({ type: "set", key: "c", data: 3 });
      await s2.dispose();

      const s3 = await Store.open(dir, nodeFs);
      assert.equal(s3.has("a"), false);
      assert.equal(s3.get("b"), 2);
      assert.equal(s3.get("c"), 3);
      assert.equal(s3.size, 2);
      await s3.dispose();
    });

    it("data persists after dispose and reopen", async (t) => {
      const dir = await setup(t);
      const store = await Store.open(dir, nodeFs);
      await store.append({ type: "set", key: "a", data: 1 });
      await store.dispose();

      const store2 = await Store.open(dir, nodeFs);
      assert.equal(store2.get("a"), 1);
      await store2.dispose();
    });

    it("set(key, undefined) does not survive persistence round-trip", async (t) => {
      const dir = await setup(t);

      const s1 = await Store.open(dir, nodeFs);
      await s1.append({ type: "set", key: "u", data: undefined });
      assert.equal(s1.has("u"), true);
      await s1.dispose();

      const s2 = await Store.open(dir, nodeFs);
      assert.equal(s2.has("u"), false);
      await s2.dispose();
    });
  });

  describe("locking", { concurrency: true }, () => {
    it("prevents concurrent open via lock", async (t) => {
      const dir = await setup(t);
      const store1 = await Store.open(dir, nodeFs);
      await assert.rejects(
        () => Store.open(dir, nodeFs),
        (err: unknown) => err instanceof LockError,
      );
      await store1.dispose();
    });

    it("releases lock on dispose, allowing reopen", async (t) => {
      const dir = await setup(t);
      const store1 = await Store.open(dir, nodeFs);
      await store1.append({ type: "set", key: "a", data: 1 });
      await store1.dispose();

      const store2 = await Store.open(dir, nodeFs);
      assert.equal(store2.get("a"), 1);
      assert.equal(store2.size, 1);
      await store2.dispose();
    });

    it("recovers stale lock from dead process", async (t) => {
      const dir = await setup(t);
      await seedFile(
        nodeFs,
        join(dir, "lock"),
        JSON.stringify({ pid: 999999999, timestamp: new Date().toISOString() }),
      );

      const store = await Store.open(dir, nodeFs);
      assert.equal(store.size, 0);
      await store.dispose();
    });

    it("throws on lock file with invalid JSON", async (t) => {
      const dir = await setup(t);
      await seedFile(nodeFs, join(dir, "lock"), "NOT JSON{{{");

      await assert.rejects(
        () => Store.open(dir, nodeFs),
        (err: unknown) => err instanceof SyntaxError,
      );
    });

    it("throws on lock file with wrong schema", async (t) => {
      const dir = await setup(t);
      await seedFile(
        nodeFs,
        join(dir, "lock"),
        JSON.stringify({ wrong: "schema" }),
      );

      await assert.rejects(
        () => Store.open(dir, nodeFs),
        (err: unknown) => err instanceof Error && err.name === "ZodError",
      );
    });

    it("releases lock when state read fails during open", async (t) => {
      const dir = await setup(t);
      await seedFile(nodeFs, join(dir, "state.json"), "not json{{{");

      await assert.rejects(
        () => Store.open(dir, nodeFs),
        (err: unknown) => err instanceof StateCorruptedError,
      );

      // Fix the corrupt file, then verify lock was released by reopening
      await seedFile(nodeFs, join(dir, "state.json"), "{}");
      const store = await Store.open(dir, nodeFs);
      await store.dispose();
    });

    it("releases lock when WAL read fails during open", async (t) => {
      const dir = await setup(t);
      await seedFile(nodeFs, join(dir, "state.json"), "{}");
      await seedFile(
        nodeFs,
        join(dir, "wal.jsonl"),
        `${JSON.stringify({ type: "unknown", key: "a" })}\n`,
      );

      await assert.rejects(
        () => Store.open(dir, nodeFs),
        (err: unknown) => err instanceof WALCorruptedError,
      );

      // Lock must be released so a subsequent open can succeed
      await seedFile(nodeFs, join(dir, "wal.jsonl"), "");
      const store = await Store.open(dir, nodeFs);
      await store.dispose();
    });

    it("releases lock when compaction during open fails", async (t) => {
      const dir = await setup(t);
      const brokenFs: FileSystem = {
        ...nodeFs,
        writeFile: ((path: string, data: string, options: { flag: string }) => {
          if (path.includes(".state.json.tmp")) {
            return Promise.reject(new Error("disk full"));
          }
          return nodeFs.writeFile(path, data, options);
        }) as FileSystem["writeFile"],
      };

      await seedFile(
        nodeFs,
        join(dir, "wal.jsonl"),
        `${JSON.stringify({ type: "set", key: "a", data: 1 })}\n`,
      );

      await assert.rejects(
        () => Store.open(dir, brokenFs),
        (err: unknown) => err instanceof Error && err.message === "disk full",
      );

      // Lock must be released so a subsequent open can succeed
      const store = await Store.open(dir, nodeFs);
      assert.equal(store.get("a"), 1);
      await store.dispose();
    });
  });

  describe("dispose", { concurrency: true }, () => {
    it("calling dispose twice does not throw", async (t) => {
      const dir = await setup(t);
      const store = await Store.open(dir, nodeFs);
      await store.append({ type: "set", key: "a", data: 1 });
      await store.dispose();
      await store.dispose();
    });

    it("asyncDispose works the same as dispose", async (t) => {
      const dir = await setup(t);
      {
        await using store = await Store.open(dir, nodeFs);
        await store.append({ type: "set", key: "k", data: "v" });
      }

      const stateRaw = await readFile(join(dir, "state.json"), "utf8");
      const state = JSON.parse(stateRaw) as Record<string, unknown>;
      assert.equal(state["k"], "v");
    });

    it("throws on append after dispose", async (t) => {
      const dir = await setup(t);
      const store = await Store.open(dir, nodeFs);
      await store.dispose();

      await assert.rejects(
        () => store.append({ type: "set", key: "a", data: 1 }),
        (err: unknown) =>
          err instanceof Error && err.message === "Store is disposed",
      );
    });

    it("propagates filesystem errors during compaction but releases lock", async (t) => {
      const dir = await setup(t);
      const brokenFs: FileSystem = { ...nodeFs };
      const store = await Store.open(dir, brokenFs);
      await store.append({ type: "set", key: "a", data: 1 });

      brokenFs.writeFile = () => Promise.reject(new Error("disk full"));

      await assert.rejects(
        () => store.dispose(),
        (err: unknown) => err instanceof Error && err.message === "disk full",
      );

      // Lock is released in the finally block of dispose despite compaction failure
      brokenFs.writeFile = nodeFs.writeFile;
      const store2 = await Store.open(dir, brokenFs);
      await store2.dispose();
    });
  });

  describe("delete", { concurrency: true }, () => {
    it("removes all files and skips compaction on dispose", async (t) => {
      const dir = await setup(t);
      const store = await Store.open(dir, nodeFs);
      await store.append({ type: "set", key: "k", data: "v" });
      await store.delete();
      await store.dispose();

      await assert.rejects(
        () => readFile(join(dir, "state.json"), "utf8"),
        (err: NodeJS.ErrnoException) => err.code === "ENOENT",
      );
    });

    it("throws on append after delete", async (t) => {
      const dir = await setup(t);
      const store = await Store.open(dir, nodeFs);
      await store.delete();

      await assert.rejects(
        () => store.append({ type: "set", key: "a", data: 1 }),
        (err: unknown) =>
          err instanceof Error && err.message === "Store is deleted",
      );
      await store.dispose();
    });

    it("works when directory is already gone", async (t) => {
      const dir = await setup(t);
      const store = await Store.open(dir, nodeFs);
      await store.delete();
      await store.delete();
      await store.dispose();
    });
  });

  describe("error handling", { concurrency: true }, () => {
    it("propagates filesystem errors on append", async (t) => {
      const dir = await setup(t);
      const brokenFs: FileSystem = {
        ...nodeFs,
        appendFile: () => Promise.reject(new Error("disk full")),
      };
      const store = await Store.open(dir, brokenFs);

      await assert.rejects(
        () => store.append({ type: "set", key: "x", data: 1 }),
        (err: unknown) => err instanceof Error && err.message === "disk full",
      );

      brokenFs.appendFile = nodeFs.appendFile;
      brokenFs.writeFile = nodeFs.writeFile;
      await store.dispose();
    });

    it("does not mutate in-memory state when WAL write fails", async (t) => {
      const dir = await setup(t);
      const brokenFs: FileSystem = {
        ...nodeFs,
        appendFile: () => Promise.reject(new Error("disk full")),
      };
      const store = await Store.open(dir, brokenFs);

      await assert.rejects(
        () => store.append({ type: "set", key: "x", data: 1 }),
        (err: unknown) => err instanceof Error && err.message === "disk full",
      );

      assert.equal(store.has("x"), false);
      assert.equal(store.size, 0);

      brokenFs.appendFile = nodeFs.appendFile;
      brokenFs.writeFile = nodeFs.writeFile;
      await store.dispose();
    });
  });
});
