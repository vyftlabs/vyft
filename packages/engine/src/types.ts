export type Action = "create" | "update" | "delete";

export interface Change<T = unknown> {
  urn: string;
  action: Action;
  old?: T;
  new?: T;
}

export interface Result<T = unknown> {
  change: Change<T>;
  output: unknown;
}

export interface Dispatcher<T = unknown> {
  dispatch(change: Change<T>): Promise<Result<T>>;
}

export interface State<T = unknown> {
  entries: Record<string, T>;
}
