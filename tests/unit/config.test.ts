import { ok, rejects, strictEqual } from "node:assert";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { findConfig, loadConfig } from "../../src/config.ts";

describe("findConfig", () => {
  let dir: string;

  it("finds vyft.config.ts", async () => {
    dir = await mkdtemp(join(tmpdir(), "vyft-"));
    await writeFile(join(dir, "vyft.config.ts"), "export default {}");
    const path = await findConfig(dir);
    ok(path.endsWith("vyft.config.ts"));
    await rm(dir, { recursive: true });
  });

  it("finds vyft.config.js when no .ts exists", async () => {
    dir = await mkdtemp(join(tmpdir(), "vyft-"));
    await writeFile(join(dir, "vyft.config.js"), "export default {}");
    const path = await findConfig(dir);
    ok(path.endsWith("vyft.config.js"));
    await rm(dir, { recursive: true });
  });

  it("prefers .ts over .js", async () => {
    dir = await mkdtemp(join(tmpdir(), "vyft-"));
    await writeFile(join(dir, "vyft.config.ts"), "export default {}");
    await writeFile(join(dir, "vyft.config.js"), "export default {}");
    const path = await findConfig(dir);
    ok(path.endsWith("vyft.config.ts"));
    await rm(dir, { recursive: true });
  });

  it("throws when no config file exists", async () => {
    dir = await mkdtemp(join(tmpdir(), "vyft-"));
    await rejects(() => findConfig(dir), /No config file found/);
    await rm(dir, { recursive: true });
  });
});

describe("loadConfig", () => {
  let dir: string;

  it("loads named exports as module properties", async () => {
    dir = await mkdtemp(join(tmpdir(), "vyft-"));
    const file = join(dir, "vyft.config.ts");
    await writeFile(file, `export const name = "test";`);
    const mod = (await loadConfig(file)) as Record<string, unknown>;
    strictEqual(mod.name, "test");
    await rm(dir, { recursive: true });
  });

  it("loads default export", async () => {
    dir = await mkdtemp(join(tmpdir(), "vyft-"));
    const file = join(dir, "vyft.config.ts");
    await writeFile(file, `export default { x: 1 };`);
    const mod = (await loadConfig(file)) as Record<string, unknown>;
    const def = mod.default as Record<string, unknown>;
    strictEqual(def.x, 1);
    await rm(dir, { recursive: true });
  });
});
