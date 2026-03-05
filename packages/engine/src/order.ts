import type { Resource } from "@vyft/primitives";
import type { Graph } from "./graph.ts";

/** Topological sort — dependencies before dependents. */
export function order(graph: Graph): Resource[] {
  const visited = new Set<string>();
  const result: Resource[] = [];

  function visit(id: string): void {
    if (visited.has(id)) return;
    visited.add(id);

    const deps = graph.dependencies.get(id);
    if (deps) {
      for (const dep of deps) visit(dep);
    }

    const resource = graph.resources.get(id);
    if (resource) result.push(resource);
  }

  for (const id of graph.resources.keys()) {
    visit(id);
  }

  return result;
}

/**
 * Group resources into parallel execution levels.
 * Level 0 has no dependencies; level N depends only on levels < N.
 * Resources within the same level are safe to execute concurrently.
 */
export function levels(graph: Graph): Resource[][] {
  const depths = new Map<string, number>();

  function depth(id: string): number {
    const cached = depths.get(id);
    if (cached !== undefined) return cached;

    let d = 0;
    const deps = graph.dependencies.get(id);
    if (deps) {
      for (const dep of deps) {
        d = Math.max(d, depth(dep) + 1);
      }
    }

    depths.set(id, d);
    return d;
  }

  for (const id of graph.resources.keys()) {
    depth(id);
  }

  const result: Resource[][] = [];
  for (const [id, d] of depths) {
    while (result.length <= d) result.push([]);
    const resource = graph.resources.get(id);
    if (resource) result[d]?.push(resource);
  }

  return result;
}
