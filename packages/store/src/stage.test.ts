import { deepStrictEqual, strictEqual } from "node:assert";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { createStageStore } from "./stage.ts";
import type { StageData } from "./types.ts";

function makeStageData(overrides: Partial<StageData> = {}): StageData {
  return {
    version: 1,
    values: {},
    secrets: null,
    ...overrides,
  };
}

describe("StageStore", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "vyft-stage-"));
  });

  it("loadStage returns null for non-existent stage", async () => {
    const store = createStageStore(root);
    strictEqual(await store.loadStage("prod"), null);
  });

  it("saveStage and loadStage round-trip", async () => {
    const store = createStageStore(root);
    const data = makeStageData({
      values: { DB_URL: "postgres://prod:5432/db" },
    });
    await store.saveStage("prod", data);
    deepStrictEqual(await store.loadStage("prod"), data);
  });

  it("saveStage writes valid JSON with trailing newline", async () => {
    const store = createStageStore(root);
    await store.saveStage("prod", makeStageData());
    const raw = await readFile(join(root, "stages", "prod.json"), "utf8");
    strictEqual(raw.endsWith("\n"), true);
    JSON.parse(raw);
  });

  it("saveStage overwrites existing data", async () => {
    const store = createStageStore(root);
    await store.saveStage("prod", makeStageData({ values: { A: "1" } }));
    const updated = makeStageData({ values: { A: "2", B: "3" } });
    await store.saveStage("prod", updated);
    deepStrictEqual(await store.loadStage("prod"), updated);
  });

  it("no tmp file left after saveStage", async () => {
    const store = createStageStore(root);
    await store.saveStage("prod", makeStageData());
    const tmpPath = join(root, "stages", ".prod.json.tmp");
    try {
      await stat(tmpPath);
      throw new Error("tmp file should not exist");
    } catch (err: unknown) {
      strictEqual((err as NodeJS.ErrnoException).code, "ENOENT");
    }
  });

  it("deleteStage removes the stage file", async () => {
    const store = createStageStore(root);
    await store.saveStage("prod", makeStageData());
    await store.deleteStage("prod");
    strictEqual(await store.loadStage("prod"), null);
  });

  it("deleteStage is idempotent", async () => {
    const store = createStageStore(root);
    await store.deleteStage("nonexistent");
  });

  it("listStages returns empty array when no stages exist", async () => {
    const store = createStageStore(root);
    deepStrictEqual(await store.listStages(), []);
  });

  it("listStages returns sorted stage names", async () => {
    const store = createStageStore(root);
    await store.saveStage("prod", makeStageData());
    await store.saveStage("staging", makeStageData());
    await store.saveStage("dev", makeStageData());
    deepStrictEqual(await store.listStages(), ["dev", "prod", "staging"]);
  });

  it("listStages ignores non-JSON files", async () => {
    const store = createStageStore(root);
    await store.saveStage("prod", makeStageData());
    // The "active" file is not a .json file, so it should be ignored
    const { writeFile, mkdir } = await import("node:fs/promises");
    await mkdir(join(root, "stages"), { recursive: true });
    await writeFile(join(root, "stages", "active"), "prod\n");
    deepStrictEqual(await store.listStages(), ["prod"]);
  });
});
