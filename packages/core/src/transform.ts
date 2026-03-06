import type { Entry, State } from "@vyft/engine";
import { sealInput } from "./envelope.ts";
import type { ResourceEntry, ResourceRef } from "./resource.ts";

export class StateBuilder {
  readonly entries: Record<string, Entry>;

  constructor(entries: Record<string, Entry>) {
    this.entries = entries;
  }

  add<T>(entry: ResourceEntry<T>): StateBuilder {
    const engineEntry: Entry = {
      urn: entry.urn,
      input: sealInput(entry.value ?? {}),
    };
    if (entry.dependsOn) {
      engineEntry.dependsOn = entry.dependsOn;
    }
    return new StateBuilder({ ...this.entries, [entry.urn]: engineEntry });
  }

  update(
    ref: ResourceRef,
    fn: (prev: Record<string, unknown>) => Record<string, unknown>,
  ): StateBuilder {
    const existing = this.entries[ref.urn];
    if (!existing) {
      throw new Error(`Cannot update unknown entry: ${ref.urn}`);
    }
    return new StateBuilder({
      ...this.entries,
      [ref.urn]: { ...existing, input: fn(existing.input) },
    });
  }

  remove(ref: ResourceRef): StateBuilder {
    const { [ref.urn]: _, ...rest } = this.entries;
    return new StateBuilder(rest);
  }
}

export function transform(current: State): StateBuilder {
  return new StateBuilder({ ...current.entries });
}
