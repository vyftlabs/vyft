import { rejects, strictEqual } from "node:assert";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { Lock, LockError } from "./lock.ts";

describe("Lock", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vyft-lock-"));
  });

  it("acquires and releases a lock", async () => {
    const lockPath = join(dir, "lock");
    const lock = new Lock(lockPath);
    await lock.acquire();

    const content = JSON.parse(await readFile(lockPath, "utf8"));
    strictEqual(content.pid, process.pid);
    strictEqual(typeof content.timestamp, "string");

    await lock.release();
    try {
      await stat(lockPath);
      throw new Error("lock file should not exist");
    } catch (err: unknown) {
      strictEqual((err as NodeJS.ErrnoException).code, "ENOENT");
    }
  });

  it("throws on concurrent lock from same process", async () => {
    const lockPath = join(dir, "lock");
    const lock1 = new Lock(lockPath);
    await lock1.acquire();
    try {
      const lock2 = new Lock(lockPath);
      await rejects(() => lock2.acquire(), LockError);
    } finally {
      await lock1.release();
    }
  });

  it("takes over stale lock from a dead process", async () => {
    const lockPath = join(dir, "lock");
    await mkdir(dir, { recursive: true });

    const stalePid = 2147483647;
    await writeFile(
      lockPath,
      JSON.stringify({ pid: stalePid, timestamp: new Date().toISOString() }),
    );

    const lock = new Lock(lockPath);
    await lock.acquire();
    const content = JSON.parse(await readFile(lockPath, "utf8"));
    strictEqual(content.pid, process.pid);
    await lock.release();
  });

  it("release is idempotent", async () => {
    const lockPath = join(dir, "lock");
    const lock = new Lock(lockPath);
    await lock.acquire();
    await lock.release();
    await lock.release();
  });
});
