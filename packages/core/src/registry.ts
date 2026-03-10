import type { ResourceEntry } from "./resource.ts";

let entries: ResourceEntry[] = [];
let stack: string[] = [];
let handles = new WeakMap<object, string>();

function begin(): void {
  entries = [];
  stack = [];
  handles = new WeakMap();
}

function registerHandle(handle: object, urn: string): void {
  handles.set(handle, urn);
}

function urnOf(handle: object): string {
  const urn = handles.get(handle);
  if (urn === undefined) {
    throw new Error("Unknown handle — not registered in the current program");
  }
  return urn;
}

function register(entry: ResourceEntry): void {
  entries.push(entry);
}

function collect(): ResourceEntry[] {
  const result = entries;
  entries = [];
  stack = [];
  return result;
}

function pushScope(urn: string): void {
  stack.push(urn);
}

function popScope(): void {
  stack.pop();
}

function currentScope(): string | undefined {
  return stack[stack.length - 1];
}

export const registry = {
  begin,
  register,
  collect,
  pushScope,
  popScope,
  currentScope,
  registerHandle,
  urnOf,
};
