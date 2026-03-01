import { deepStrictEqual, rejects, strictEqual } from "node:assert";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { createFileStore, LockError } from "./file.ts";

describe("FileStore lock", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "vyft-lock-"));
  });

  it("acquires and releases a lock", async () => {
    const store = createFileStore(root);
    const unlock = await store.lock("ctx", "proj");
    const lockFile = join(root, "ctx", "proj", "lock");
    const content = JSON.parse(await readFile(lockFile, "utf8"));
    strictEqual(content.pid, process.pid);
    strictEqual(typeof content.timestamp, "string");

    await unlock();
    try {
      await stat(lockFile);
      throw new Error("lock file should not exist");
    } catch (err: unknown) {
      strictEqual((err as NodeJS.ErrnoException).code, "ENOENT");
    }
  });

  it("throws on concurrent lock from same process", async () => {
    const store = createFileStore(root);
    const unlock = await store.lock("ctx", "proj");
    try {
      await rejects(() => store.lock("ctx", "proj"), LockError);
    } finally {
      await unlock();
    }
  });

  it("throws LockError with vyft cancel hint for stale lock", async () => {
    const store = createFileStore(root);
    const dir = join(root, "ctx", "proj");
    await mkdir(dir, { recursive: true });

    const stalePid = 2147483647;
    await writeFile(
      join(dir, "lock"),
      JSON.stringify({ pid: stalePid, timestamp: new Date().toISOString() }),
    );

    await rejects(
      () => store.lock("ctx", "proj"),
      (err: unknown) => {
        if (!(err instanceof LockError)) return false;
        if (!err.message.includes("vyft cancel")) return false;
        if (!err.message.includes(String(stalePid))) return false;
        return true;
      },
    );
  });

  it("unlock is idempotent", async () => {
    const store = createFileStore(root);
    const unlock = await store.lock("ctx", "proj");
    await unlock();
    await unlock();
  });
});

describe("FileStore inspectLock", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "vyft-lock-"));
  });

  it("returns null when no lock exists", async () => {
    const store = createFileStore(root);
    const result = await store.inspectLock("ctx", "proj");
    strictEqual(result, null);
  });

  it("returns lock info when lock file exists", async () => {
    const store = createFileStore(root);
    const dir = join(root, "ctx", "proj");
    await mkdir(dir, { recursive: true });

    const ts = new Date().toISOString();
    await writeFile(
      join(dir, "lock"),
      JSON.stringify({ pid: 12345, timestamp: ts }),
    );

    const result = await store.inspectLock("ctx", "proj");
    deepStrictEqual(result, { pid: 12345, timestamp: ts });
  });
});

describe("FileStore clearLock", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "vyft-lock-"));
  });

  it("removes an existing lock file", async () => {
    const store = createFileStore(root);
    const dir = join(root, "ctx", "proj");
    await mkdir(dir, { recursive: true });

    await writeFile(
      join(dir, "lock"),
      JSON.stringify({ pid: 12345, timestamp: new Date().toISOString() }),
    );
    await store.clearLock("ctx", "proj");

    try {
      await stat(join(dir, "lock"));
      throw new Error("lock file should not exist");
    } catch (err: unknown) {
      strictEqual((err as NodeJS.ErrnoException).code, "ENOENT");
    }
  });

  it("does not throw when no lock file exists", async () => {
    const store = createFileStore(root);
    await store.clearLock("ctx", "proj");
  });
});
