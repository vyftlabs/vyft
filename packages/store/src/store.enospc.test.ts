import assert from "node:assert/strict";
import { unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { nodeFs } from "./fs/node.ts";
import { Store } from "./store.ts";

const tmpfsDir = process.env["TMPFS_DIR"];
const LARGE_VALUE = "x".repeat(5000);

function fillDisk(dir: string) {
  try {
    writeFileSync(join(dir, "filler"), Buffer.alloc(64 * 1024));
  } catch {
    // Expected ENOSPC
  }
}

function freeDisk(dir: string) {
  try {
    unlinkSync(join(dir, "filler"));
  } catch {
    // May already be gone
  }
}

describe("Store ENOSPC", { skip: !tmpfsDir, concurrency: false }, () => {
  if (!tmpfsDir) return;
  const dir = tmpfsDir;

  it("append fails with ENOSPC on full disk", async () => {
    const store = await Store.open(join(dir, "s1"), nodeFs);

    await store.append({ type: "set", key: "before", data: 1 });
    assert.equal(store.get("before"), 1);

    fillDisk(dir);

    await assert.rejects(
      () => store.append({ type: "set", key: "after", data: LARGE_VALUE }),
      (err: NodeJS.ErrnoException) => {
        assert.equal(err.code, "ENOSPC");
        return true;
      },
    );

    assert.equal(store.has("after"), false);
    assert.equal(store.get("before"), 1);

    freeDisk(dir);
    await store.delete();
    await store.dispose();
  });

  it("compaction fails with ENOSPC on full disk", async () => {
    const store = await Store.open(join(dir, "s2"), nodeFs);

    await store.append({ type: "set", key: "big", data: LARGE_VALUE });

    fillDisk(dir);

    await assert.rejects(
      () => store.dispose(),
      (err: NodeJS.ErrnoException) => {
        assert.equal(err.code, "ENOSPC");
        return true;
      },
    );
  });
});
