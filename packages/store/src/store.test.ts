import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LockError, StateCorruptedError, WALCorruptedError } from "./error.ts";
import { createMemoryFs } from "./fs/memory.ts";
import { Store } from "./store.ts";
import type { WALEntry } from "./wal.ts";

function set(key: string, data: unknown): WALEntry {
  return { type: "set", key, data };
}

describe("Store", () => {
  it("append, auto-compact on dispose, reopen, update, remove", async () => {
    const fs = createMemoryFs();

    const s1 = await Store.open("/s", fs);
    assert.equal(s1.size, 0);

    await s1.append(set("bucket", { status: "committed", name: "my-bucket" }));
    await s1.append(set("bucket", { status: "committed", name: "renamed" }));
    assert.deepEqual(s1.get("bucket"), {
      status: "committed",
      name: "renamed",
    });
    await s1.dispose();

    const s2 = await Store.open("/s", fs);
    assert.deepEqual(s2.get("bucket"), {
      status: "committed",
      name: "renamed",
    });

    await s2.append({ type: "remove", key: "bucket" });
    assert.equal(s2.size, 0);
    await s2.dispose();

    const s3 = await Store.open("/s", fs);
    assert.equal(s3.size, 0);
    await s3.dispose();
  });

  it("replays WAL after crash and compacts on open", async () => {
    const fs = createMemoryFs();
    await fs.writeFile(
      "/s/wal.jsonl",
      `${JSON.stringify(set("db", { engine: "postgres" }))}\n`,
      "utf8",
    );

    const store = await Store.open("/s", fs);
    assert.deepEqual(store.get("db"), { engine: "postgres" });
    await store.dispose();
  });

  it("lock prevents concurrent access", async () => {
    const fs = createMemoryFs();
    const store = await Store.open("/s", fs);
    await assert.rejects(() => Store.open("/s", fs), LockError);
    await store.dispose();

    const store2 = await Store.open("/s", fs);
    assert.ok(store2);
    await store2.dispose();
  });

  it("throws on corrupted state and WAL", async () => {
    const bad = createMemoryFs();
    await bad.writeFile("/s/state.json", "not json{{{", "utf8");
    await assert.rejects(() => Store.open("/s", bad), StateCorruptedError);

    const invalid = createMemoryFs();
    await invalid.writeFile("/s/state.json", "not an object", "utf8");
    await assert.rejects(() => Store.open("/s", invalid), StateCorruptedError);

    const badWal = createMemoryFs();
    await badWal.writeFile(
      "/s/wal.jsonl",
      `${JSON.stringify({ type: "invalid" })}\n`,
      "utf8",
    );
    await assert.rejects(() => Store.open("/s", badWal), WALCorruptedError);
  });

  it("await using checkpoints successful appends even when operation throws", async () => {
    const fs = createMemoryFs();

    try {
      await using store = await Store.open("/s", fs);
      await store.append(set("svc", { status: "committed" }));
      throw new Error("deploy failed");
    } catch {
      // expected
    }

    const state = await fs.readFile("/s/state.json", "utf8");
    assert.ok(state.includes("svc"));

    const store = await Store.open("/s", fs);
    assert.equal(store.size, 1);
    assert.deepEqual(store.get("svc"), { status: "committed" });
    await store.dispose();
  });

  it("multi-session deploy simulation with crash mid-way", async () => {
    const fs = createMemoryFs();

    {
      await using store = await Store.open("/s", fs);
      await store.append(
        set("vpc", { status: "committed", cidr: "10.0.0.0/16" }),
      );
      await store.append(set("subnet", { status: "committed", vpc: "vpc-1" }));
      await store.append(
        set("db", {
          status: "committed",
          engine: "postgres",
          endpoint: "db.local",
        }),
      );
    }

    {
      const raw = await fs.readFile("/s/state.json", "utf8");
      const state = JSON.parse(raw);
      assert.equal(Object.keys(state).length, 3);
    }

    try {
      await using store = await Store.open("/s", fs);
      await store.append(
        set("db", {
          status: "committed",
          engine: "postgres",
          size: "large",
          endpoint: "db.prod",
        }),
      );
      await store.append(
        set("cache", {
          status: "committed",
          engine: "redis",
          endpoint: "cache.local",
        }),
      );
      throw new Error("deploy crashed");
    } catch {
      // simulated crash
    }

    {
      await using store = await Store.open("/s", fs);
      assert.equal(store.size, 4);
      assert.deepEqual(store.get("db"), {
        status: "committed",
        engine: "postgres",
        size: "large",
        endpoint: "db.prod",
      });
      assert.deepEqual(store.get("cache"), {
        status: "committed",
        engine: "redis",
        endpoint: "cache.local",
      });

      await store.append({ type: "remove", key: "cache" });
      await store.append({ type: "remove", key: "subnet" });
    }

    {
      await using store = await Store.open("/s", fs);
      assert.equal(store.size, 2);
      assert.ok(store.has("vpc"));
      assert.ok(store.has("db"));
      assert.ok(!store.has("subnet"));
      assert.ok(!store.has("cache"));
    }
  });

  it("delete prevents checkpoint on dispose", async () => {
    const fs = createMemoryFs();
    const store = await Store.open("/s", fs);
    await store.append(set("x", { status: "creating" }));
    await store.delete();
    await store.dispose();

    const store2 = await Store.open("/s", fs);
    assert.equal(store2.size, 0);
    await store2.dispose();
  });
});
