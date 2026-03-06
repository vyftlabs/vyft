import type { Dependable } from "./brands.ts";

export type Action = "create" | "update" | "delete";

export type EntryData = Omit<Entry, "urn">;

export interface Change {
  urn: string;
  action: Action;
  old?: EntryData;
  new?: EntryData;
}

export interface Result {
  change: Change;
  externalId?: string;
  output: Record<string, unknown>;
}

export interface Dispatcher {
  dispatch(change: Change): Promise<Result>;
}

export interface Entry {
  urn: string;
  externalId?: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  dependsOn?: Dependable[];
}

export interface State {
  entries: Record<string, Entry>;
}
