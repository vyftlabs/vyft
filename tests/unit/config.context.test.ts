import { strictEqual } from "node:assert";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { resolveContext } from "../../src/config.ts";

describe("resolveContext", () => {
  let root: string;
  const origEnv = process.env.VYFT_CONTEXT;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "vyft-ctx-"));
    delete process.env.VYFT_CONTEXT;
  });

  afterEach(async () => {
    if (origEnv !== undefined) {
      process.env.VYFT_CONTEXT = origEnv;
    } else {
      delete process.env.VYFT_CONTEXT;
    }
    await rm(root, { recursive: true, force: true });
  });

  it("returns 'default' when nothing is configured", async () => {
    strictEqual(await resolveContext(root), "default");
  });

  it("reads from active file", async () => {
    await writeFile(join(root, "active"), "staging\n", "utf8");
    strictEqual(await resolveContext(root), "staging");
  });

  it("env var takes priority over active file", async () => {
    await writeFile(join(root, "active"), "staging\n", "utf8");
    process.env.VYFT_CONTEXT = "production";
    strictEqual(await resolveContext(root), "production");
  });

  it("falls back to default on empty active file", async () => {
    await writeFile(join(root, "active"), "\n", "utf8");
    strictEqual(await resolveContext(root), "default");
  });
});
