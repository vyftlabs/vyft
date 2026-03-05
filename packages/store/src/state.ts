import { dirname, join } from "node:path";
import { StateCorruptedError } from "./error.ts";
import type { FileSystem } from "./fs/types.ts";
import { stateFileSchema } from "./schema.ts";

export type State = Map<string, unknown>;

export class StateStore {
  private readonly path: string;
  private readonly fs: FileSystem;

  constructor(path: string, fs: FileSystem) {
    this.path = path;
    this.fs = fs;
  }

  async read(): Promise<State> {
    let raw: string;
    try {
      raw = await this.fs.readFile(this.path, "utf8");
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return new Map();
      throw err;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new StateCorruptedError(`Invalid JSON in ${this.path}`);
    }

    const result = stateFileSchema.safeParse(parsed);
    if (!result.success) {
      throw new StateCorruptedError(
        `Invalid state file: ${result.error.message}`,
      );
    }

    const state: State = new Map();
    for (const [key, value] of Object.entries(result.data)) {
      state.set(key, value);
    }
    return state;
  }

  async write(state: State): Promise<void> {
    const dir = dirname(this.path);
    await this.fs.mkdir(dir, { recursive: true });
    const obj = Object.fromEntries(state);
    const tmp = join(dir, ".state.json.tmp");
    await this.fs.writeFile(tmp, `${JSON.stringify(obj, null, 2)}\n`, "utf8");
    await this.fs.rename(tmp, this.path);
  }
}
