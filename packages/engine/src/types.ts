import type { Dependable } from "./brands.ts";

export type Action = "create" | "update" | "delete";

export interface Change {
  urn: string;
  action: Action;
}

export interface Dispatcher {
  dispatch(change: Change): Promise<void>;
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
