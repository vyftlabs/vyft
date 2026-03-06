import type { State } from "@vyft/engine";
import type { ResourceEntry, ResourceRef } from "./resource.ts";

export class StateBuilder {
  readonly entries: Record<string, unknown>;

  constructor(entries: Record<string, unknown>) {
    this.entries = entries;
  }

  add<T>(entry: ResourceEntry<T>): StateBuilder {
    return new StateBuilder({ ...this.entries, [entry.urn]: entry.value });
  }

  update<T>(ref: ResourceRef<T>, fn: (prev: T) => T): StateBuilder {
    const prev = this.entries[ref.urn];
    if (prev === undefined) {
      throw new Error(`Cannot update unknown entry: ${ref.urn}`);
    }
    return new StateBuilder({ ...this.entries, [ref.urn]: fn(prev as T) });
  }

  remove(ref: ResourceRef): StateBuilder {
    const { [ref.urn]: _, ...rest } = this.entries;
    return new StateBuilder(rest);
  }
}

export function transform(current: State): StateBuilder {
  return new StateBuilder({ ...current.entries });
}
