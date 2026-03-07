import type { z } from "zod";
import { WALCorruptedError } from "./error.ts";
import { walEntrySchema } from "./schema.ts";
import type { State } from "./state.ts";

export type WALEntry = z.infer<typeof walEntrySchema>;

export function parseWAL(raw: string): WALEntry[] {
  const lines = raw.split("\n");
  const entries: WALEntry[] = [];

  // Find the last non-empty line index (for crash-truncation tolerance)
  let lastNonEmpty = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    if (l?.trim()) {
      lastNonEmpty = i;
      break;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined || !line.trim()) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      // Only tolerate a malformed last line (crash truncation)
      if (i === lastNonEmpty) continue;
      throw new WALCorruptedError(
        `Corrupt WAL entry at line ${i + 1}: invalid JSON`,
      );
    }

    const result = walEntrySchema.safeParse(parsed);
    if (!result.success) {
      throw new WALCorruptedError(`Invalid WAL entry: ${result.error.message}`);
    }
    if (result.data.type === "set" && result.data.data === undefined) {
      throw new WALCorruptedError(
        "Invalid WAL entry: data is required for set entries",
      );
    }
    entries.push(result.data);
  }
  return entries;
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
