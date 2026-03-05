import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { URN } from "@vyft/primitives";
import type { ResourceState, State } from "./state.ts";

/**
 * Atomic read/write of `state.json`.
 * On disk: `ResourceState[]` (array). In memory: `Map<URN, ResourceState>`.
 * Handles migration from the old `PersistedState` wrapper format.
 */
export class StateStore {
  private readonly path: string;
  constructor(path: string) {
    this.path = path;
  }

  async read(): Promise<State> {
    let raw: string;
    try {
      raw = await readFile(this.path, "utf8");
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return new Map();
      throw err;
    }

    const parsed = JSON.parse(raw) as unknown;

    // Migration: old format has { version, resources, ... }
    let arr: ResourceState[];
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      "resources" in parsed
    ) {
      arr = (parsed as { resources: ResourceState[] }).resources;
    } else {
      arr = parsed as ResourceState[];
    }

    const state: State = new Map();
    for (const rs of arr) state.set(rs.urn as URN, rs);
    return state;
  }

  async write(state: State): Promise<void> {
    const dir = dirname(this.path);
    await mkdir(dir, { recursive: true });
    const arr = [...state.values()];
    const tmp = join(dir, ".state.json.tmp");
    await writeFile(tmp, `${JSON.stringify(arr, null, 2)}\n`, "utf8");
    await rename(tmp, this.path);
  }

  async exists(): Promise<boolean> {
    try {
      await readFile(this.path, "utf8");
      return true;
    } catch {
      return false;
    }
  }
}
