import type { ResourceEntry } from "./resource.ts";

let entries: ResourceEntry[] = [];
let stack: string[] = [];

function begin(): void {
  entries = [];
  stack = [];
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
};
