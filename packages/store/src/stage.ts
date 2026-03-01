import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import type { StageData, StageStore } from "./types.ts";

/** Create a file-backed StageStore. Files stored at `<root>/stages/<stage>.json`. */
export function createStageStore(root: string): StageStore {
  const stagesDir = join(root, "stages");

  function stagePath(stage: string): string {
    return join(stagesDir, `${stage}.json`);
  }

  return {
    async loadStage(stage) {
      try {
        const raw = await readFile(stagePath(stage), "utf8");
        return JSON.parse(raw) as StageData;
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
      }
    },

    async saveStage(stage, data) {
      await mkdir(stagesDir, { recursive: true });
      const dest = stagePath(stage);
      const tmp = join(stagesDir, `.${stage}.json.tmp`);
      await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
      await rename(tmp, dest);
    },

    async deleteStage(stage) {
      try {
        await rm(stagePath(stage));
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      }
    },

    async listStages() {
      try {
        const entries = await readdir(stagesDir);
        return entries
          .filter((e) => e.endsWith(".json"))
          .map((e) => e.slice(0, -5))
          .sort();
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw err;
      }
    },
  };
}
