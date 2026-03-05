import { dirname } from "node:path";
import type { z } from "zod";
import { WALCorruptedError } from "./error.ts";
import type { FileSystem } from "./fs/types.ts";
import { walEntrySchema } from "./schema.ts";
import type { State } from "./state.ts";

export type WALEntry = z.infer<typeof walEntrySchema>;

export class WALog {
  private readonly path: string;
  private readonly fs: FileSystem;

  constructor(path: string, fs: FileSystem) {
    this.path = path;
    this.fs = fs;
  }

  async append(entry: WALEntry): Promise<void> {
    await this.fs.mkdir(dirname(this.path), { recursive: true });
    await this.fs.appendFile(this.path, `${JSON.stringify(entry)}\n`, "utf8");
  }

  async read(): Promise<WALEntry[]> {
    let raw: string;
    try {
      raw = await this.fs.readFile(this.path, "utf8");
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }

    const entries: WALEntry[] = [];
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;

      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        break;
      }

      const result = walEntrySchema.safeParse(parsed);
      if (!result.success) {
        throw new WALCorruptedError(
          `Invalid WAL entry: ${result.error.message}`,
        );
      }
      entries.push(result.data);
    }
    return entries;
  }

  async clear(): Promise<void> {
    await this.fs.unlink(this.path).catch(() => {});
  }
}

export function apply(state: State, entry: WALEntry): void {
  if (entry.type === "set") {
    state.set(entry.key, entry.data);
  } else if (entry.type === "remove") {
    state.delete(entry.key);
  }
}

export function replay(previous: State, entries: WALEntry[]): State {
  const state = new Map(previous);
  for (const entry of entries) apply(state, entry);
  return state;
}
