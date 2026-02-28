import { ValidationError } from "../errors.ts";
import type { Graph } from "./graph.ts";

/** Validate a resource graph. Throws on duplicate IDs, dangling refs, or cycles. */
export function validate(graph: Graph): void {
  checkDanglingRefs(graph);
  checkCycles(graph);
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
