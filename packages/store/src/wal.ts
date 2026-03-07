import type { z } from "zod";
import { WALCorruptedError } from "./error.ts";
import { walEntrySchema } from "./schema.ts";
import type { State } from "./state.ts";

export type WALEntry = z.infer<typeof walEntrySchema>;

export function parseWAL(raw: string): WALEntry[] {
  const entries: WALEntry[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    const result = walEntrySchema.safeParse(parsed);
    if (!result.success) {
      throw new WALCorruptedError(`Invalid WAL entry: ${result.error.message}`);
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
