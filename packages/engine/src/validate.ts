import type { Resource } from "@vyft/core";
import { ValidationError } from "@vyft/core";
import type { Graph } from "./graph.ts";

/** Validate a resource graph. Throws on duplicate IDs, dangling refs, or cycles. */
export function validate(graph: Graph): void {
  checkDanglingRefs(graph);
  checkCycles(graph);
}

/** Resources with explicit namespace are implicitly shared (dedupe by ID). */
function isSharedResource(r: Resource): boolean {
  return "options" in r && r.options?.namespace !== undefined;
}

/**
 * Check for duplicate resource IDs before building the graph.
 * Shared services are deduped (first wins) instead of erroring.
 * Returns the deduplicated resource list.
 */
export function checkDuplicateIds(resources: Resource[]): Resource[] {
  const seen = new Map<string, Resource>();
  const result: Resource[] = [];

  for (const r of resources) {
    const existing = seen.get(r.id);
    if (existing) {
      // Shared resources dedupe silently (first wins)
      if (isSharedResource(r) && isSharedResource(existing)) {
        continue;
      }
      throw new ValidationError(
        `Duplicate resource ID "${r.id}" (used by ${existing.kind} and ${r.kind})`,
      );
    }
    seen.set(r.id, r);
    result.push(r);
  }

  return result;
}

function checkDanglingRefs(graph: Graph): void {
  for (const [id, deps] of graph.dependencies) {
    for (const dep of deps) {
      if (!graph.resources.has(dep)) {
        throw new ValidationError(
          `Resource "${id}" depends on "${dep}" which does not exist`,
        );
      }
    }
  }
}

function checkCycles(graph: Graph): void {
  const visited = new Set<string>();
  const stack = new Set<string>();

  function visit(id: string, path: string[]): void {
    if (stack.has(id)) {
      const cycle = path.slice(path.indexOf(id)).concat(id);
      throw new ValidationError(`Dependency cycle: ${cycle.join(" → ")}`);
    }
    if (visited.has(id)) return;

    stack.add(id);
    path.push(id);

    const deps = graph.dependencies.get(id);
    if (deps) {
      for (const dep of deps) visit(dep, path);
    }

    stack.delete(id);
    path.pop();
    visited.add(id);
  }

  for (const id of graph.resources.keys()) {
    visit(id, []);
  }
}
