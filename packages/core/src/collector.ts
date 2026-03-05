import type { Resource } from "@vyft/primitives";

interface Scope {
  resources: Resource[];
  parentId: string | undefined;
}

/**
 * Stack of resource collectors. Enables nested collection (parent-child).
 * Primitives push to the top of the stack when creating resources.
 */
const stack: Scope[] = [];

/** Get current collector (top of stack), or null if not collecting. */
export function currentCollector(): Resource[] | null {
  return stack.at(-1)?.resources ?? null;
}

/** Get current parent ID (for auto-scoping child resources). */
export function currentParent(): string | undefined {
  return stack.at(-1)?.parentId;
}

/**
 * Run a function while collecting resources.
 * Any resources created during execution are captured.
 *
 * @param fn - Function to execute
 * @param parentId - Optional parent ID for auto-scoping child resources
 *
 * @example
 * ```ts
 * const { result, resources } = collect(() => {
 *   const api = service("api", { image: "node" });
 *   return { api };
 * });
 * // resources contains the api service
 * ```
 */
export function collect<T>(
  fn: () => T,
  parentId?: string,
): { result: T; resources: Resource[] } {
  const scope: Scope = { resources: [], parentId };
  stack.push(scope);
  try {
    const result = fn();
    return { result, resources: scope.resources };
  } finally {
    stack.pop();
  }
}
