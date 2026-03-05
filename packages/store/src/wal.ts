import { appendFile, mkdir, readFile, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import type { ResourceState, State, WALEntry } from "./state.ts";

/**
 * Write-ahead log — append/read/clear of `wal.jsonl`.
 */
export class WALog {
  private readonly path: string;
  constructor(path: string) {
    this.path = path;
  }

  async append(entry: WALEntry): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await appendFile(this.path, `${JSON.stringify(entry)}\n`, "utf8");
  }

  async read(): Promise<WALEntry[]> {
    let raw: string;
    try {
      raw = await readFile(this.path, "utf8");
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }

    const entries: WALEntry[] = [];
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        entries.push(JSON.parse(line) as WALEntry);
      } catch {
        break; // Malformed last line = crash mid-append, discard
      }
    }
    return entries;
  }

  async clear(): Promise<void> {
    await unlink(this.path).catch(() => {});
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

/**
 * Pure function: replay WAL entries on top of a state snapshot.
 * Builds full ResourceState from raw WAL committed entries.
 */
export function replay(previous: State, entries: WALEntry[]): State {
  const state = new Map(previous);
  const now = new Date().toISOString();

  for (const entry of entries) {
    if (entry.type === "committed") {
      const prev = state.get(entry.urn);
      const rs: ResourceState = {
        urn: entry.urn,
        fingerprint: entry.fingerprint,
        inputs: entry.inputs,
        outputs: entry.outputs,
        dependencies: prev?.dependencies ?? [],
        created: prev?.created ?? now,
        modified: now,
        taint: false,
        ...(prev?.sensitive ? { sensitive: prev.sensitive } : {}),
      };
      state.set(entry.urn, rs);
    } else if (entry.type === "removed") {
      state.delete(entry.urn);
    }
    // "pending" entries don't affect state
  }

  return state;
}
