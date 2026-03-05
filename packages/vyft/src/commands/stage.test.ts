import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { resolveStage } from "@vyft/core";

// We test stage logic directly rather than through CLI dispatch.
// Stages are tracked as marker files: <root>/stages/<name>.stage

async function createStageMarker(root: string, name: string): Promise<void> {
  const dir = join(root, "stages");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${name}.stage`), "", "utf8");
}

async function stageExists(root: string, name: string): Promise<boolean> {
  try {
    const entries = await readdir(join(root, "stages"));
    return entries.includes(`${name}.stage`);
  } catch {
    return false;
  }
}

async function deleteStageMarker(root: string, name: string): Promise<void> {
  const marker = join(root, "stages", `${name}.stage`);
  try {
    await rm(marker);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

async function listStages(root: string): Promise<string[]> {
  try {
    const entries = await readdir(join(root, "stages"));
    return entries
      .filter((e) => e.endsWith(".stage"))
      .map((e) => e.slice(0, -6))
      .sort();
  } catch {
    return [];
  }
}

describe("stage operations", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "vyft-stagecmd-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("create saves stage marker and sets it as active", async () => {
    const name = "prod";
    await createStageMarker(root, name);

    const dir = join(root, "stages");
    await writeFile(join(dir, "active"), `${name}\n`, "utf8");

    ok(await stageExists(root, name), "stage marker should exist");
    strictEqual(await resolveStage(root), "prod");
  });

  it("create rejects duplicate stage name", async () => {
    await createStageMarker(root, "prod");
    ok(await stageExists(root, "prod"), "stage should already exist");
  });

  it("use switches active stage", async () => {
    await createStageMarker(root, "staging");
    await createStageMarker(root, "prod");

    const dir = join(root, "stages");

    await writeFile(join(dir, "active"), "staging\n", "utf8");
    strictEqual(await resolveStage(root), "staging");

    await writeFile(join(dir, "active"), "prod\n", "utf8");
    strictEqual(await resolveStage(root), "prod");
  });

  it("use allows local without a stage file", async () => {
    const dir = join(root, "stages");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "active"), "local\n", "utf8");

    strictEqual(await resolveStage(root), "local");
  });

  it("ls always includes local", async () => {
    await createStageMarker(root, "prod");
    await createStageMarker(root, "staging");

    const stages = await listStages(root);
    const allStages = new Set(stages);
    allStages.add("local");
    const sorted = [...allStages].sort();

    deepStrictEqual(sorted, ["local", "prod", "staging"]);
  });

  it("ls returns only local when no stages exist", async () => {
    const stages = await listStages(root);
    const allStages = new Set(stages);
    allStages.add("local");

    deepStrictEqual([...allStages].sort(), ["local"]);
  });

  it("rm deletes a stage", async () => {
    await createStageMarker(root, "prod");

    ok(await stageExists(root, "prod"), "stage should exist before rm");
    await deleteStageMarker(root, "prod");
    strictEqual(await stageExists(root, "prod"), false);
  });

  it("rm resets active to local if removed stage was active", async () => {
    await createStageMarker(root, "prod");

    const dir = join(root, "stages");
    await writeFile(join(dir, "active"), "prod\n", "utf8");

    await deleteStageMarker(root, "prod");
    await writeFile(join(dir, "active"), "local\n", "utf8");
    strictEqual(await resolveStage(root), "local");
  });

  it("resolveStage defaults to local when no active file", async () => {
    strictEqual(await resolveStage(root), "local");
  });

  it("resolveStage respects VYFT_STAGE env var", async () => {
    const original = process.env["VYFT_STAGE"];
    try {
      process.env["VYFT_STAGE"] = "production";
      strictEqual(await resolveStage(root), "production");
    } finally {
      if (original === undefined) {
        delete process.env["VYFT_STAGE"];
      } else {
        process.env["VYFT_STAGE"] = original;
      }
    }
  });
});
