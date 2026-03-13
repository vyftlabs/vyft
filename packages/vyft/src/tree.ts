import type { ApplyEvent } from "@vyft/core";
import { sealInput, urn } from "@vyft/core";

// --- Types ---

type NodeStatus = "pending" | "active" | "health" | "done" | "failed";

interface TreeNode {
  urn: string;
  label: string;
  status: NodeStatus;
  suffix: string;
  children: TreeNode[];
}

export interface TreeEntry {
  urn: string;
  dependsOn?: string[] | undefined;
  value?: Record<string, unknown> | undefined;
}

// --- Constants ---

const SPINNER = ["◐", "◓", "◑", "◒"];
const TICK_MS = 80;

// --- ANSI helpers ---

const dim = (s: string) => `\x1b[2m${s}\x1b[22m`;
const green = (s: string) => `\x1b[32m${s}\x1b[39m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[39m`;
const red = (s: string) => `\x1b[31m${s}\x1b[39m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[39m`;
const hideCursor = "\x1b[?25l";
const showCursor = "\x1b[?25h";
const eraseLine = "\x1b[2K";

// --- Implicit dependency detection (mirrors engine/plan.ts) ---

function collectImplicitDeps(
  data: unknown,
  knownUrns: Set<string>,
): Set<string> {
  const deps = new Set<string>();

  function walk(value: unknown) {
    if (typeof value !== "object" || value === null) return;
    if ("urn" in value) {
      const u = (value as Record<string, unknown>)["urn"];
      if (typeof u === "string" && knownUrns.has(u)) {
        deps.add(u);
      }
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
    } else {
      for (const v of Object.values(value)) walk(v);
    }
  }

  walk(data);
  return deps;
}

// --- Tree builder ---

function buildTree(entries: TreeEntry[]): TreeNode[] {
  const known = new Set(entries.map((e) => e.urn));

  // Collect all deps (explicit + implicit from value scanning)
  const allDeps = new Map<string, Set<string>>();
  for (const entry of entries) {
    const sealed = entry.value ? sealInput(entry.value) : undefined;
    const deps = sealed
      ? collectImplicitDeps(sealed, known)
      : new Set<string>();
    for (const dep of entry.dependsOn ?? []) {
      if (known.has(dep)) deps.add(dep);
    }
    deps.delete(entry.urn);
    allDeps.set(entry.urn, deps);
  }

  // Transitive reduction: if A→B and B→C, remove direct A→C edge.
  // This prevents hoisting resources that are only transitively referenced.
  function reachable(from: string, exclude: string): boolean {
    const visited = new Set<string>();
    const queue = [...(allDeps.get(from) ?? [])].filter((d) => d !== exclude);
    while (queue.length > 0) {
      const current = queue.pop();
      if (!current) break;
      if (current === exclude) continue;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const dep of allDeps.get(current) ?? []) {
        if (dep === exclude) return true;
        queue.push(dep);
      }
    }
    return false;
  }

  for (const [entryUrn, deps] of allDeps) {
    const toRemove: string[] = [];
    for (const dep of deps) {
      if (reachable(entryUrn, dep)) {
        toRemove.push(dep);
      }
    }
    for (const dep of toRemove) {
      deps.delete(dep);
    }
  }

  // Count how many entries depend on each URN (reverse in-degree)
  const dependentCount = new Map<string, number>();
  const singleDependent = new Map<string, string>();

  for (const [entryUrn, deps] of allDeps) {
    for (const dep of deps) {
      const count = (dependentCount.get(dep) ?? 0) + 1;
      dependentCount.set(dep, count);
      if (count === 1) {
        singleDependent.set(dep, entryUrn);
      } else {
        singleDependent.delete(dep);
      }
    }
  }

  // Resources with exactly one dependent nest under that dependent
  const nested = new Set<string>();
  const childrenOf = new Map<string, string[]>();

  for (const [dep, parent] of singleDependent) {
    const list = childrenOf.get(parent) ?? [];
    list.push(dep);
    childrenOf.set(parent, list);
    nested.add(dep);
  }

  function makeNode(urnValue: string): TreeNode {
    const parsed = urn.parse(urnValue);
    return {
      urn: urnValue,
      label: parsed.resource === "build" ? `${parsed.id} (build)` : parsed.id,
      status: "pending",
      suffix: "",
      children: (childrenOf.get(urnValue) ?? []).map(makeNode),
    };
  }

  return entries.filter((e) => !nested.has(e.urn)).map((e) => makeNode(e.urn));
}

// --- Renderer ---

function statusIcon(status: NodeStatus, frame: number): string {
  const spinner = SPINNER[frame % SPINNER.length];
  if (!spinner) return dim("○");
  switch (status) {
    case "pending":
      return dim("○");
    case "active":
      return cyan(spinner);
    case "health":
      return yellow(spinner);
    case "done":
      return green("●");
    case "failed":
      return red("●");
  }
}

function renderLines(
  nodes: TreeNode[],
  frame: number,
  prefix: string,
): string[] {
  const lines: string[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node) continue;
    const last = i === nodes.length - 1;
    const icon = statusIcon(node.status, frame);
    const suffix = node.suffix ? `  ${dim(node.suffix)}` : "";

    if (prefix === "") {
      // Top-level: simple indent
      lines.push(`  ${icon} ${node.label}${suffix}`);
    } else {
      const connector = last ? "└─ " : "├─ ";
      lines.push(`${prefix}${dim(connector)}${icon} ${node.label}${suffix}`);
    }

    if (node.children.length > 0) {
      let childPrefix: string;
      if (prefix === "") {
        childPrefix = "     ";
      } else {
        childPrefix = prefix + (last ? "   " : `${dim("│")}  `);
      }
      lines.push(...renderLines(node.children, frame, childPrefix));
    }
  }
  return lines;
}

// --- Public API ---

export function createTreeRenderer(args: { entries: TreeEntry[] }) {
  const isTTY = process.stdout.isTTY === true;
  const roots = buildTree(args.entries);

  // Index all nodes for O(1) lookup
  const nodeByUrn = new Map<string, TreeNode>();
  function indexNodes(nodes: TreeNode[]) {
    for (const node of nodes) {
      nodeByUrn.set(node.urn, node);
      indexNodes(node.children);
    }
  }
  indexNodes(roots);

  let frame = 0;
  let prevLineCount = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  let stopped = false;

  function render() {
    if (stopped) return;
    const lines = renderLines(roots, frame, "");

    if (isTTY) {
      let output = "";
      if (prevLineCount > 0) {
        output += `\x1b[${prevLineCount}A`;
      }
      for (const line of lines) {
        output += `\r${eraseLine}${line}\n`;
      }
      // Clear leftover lines from previous render
      for (let i = lines.length; i < prevLineCount; i++) {
        output += `${eraseLine}\n`;
      }
      if (lines.length < prevLineCount) {
        output += `\x1b[${prevLineCount - lines.length}A`;
      }
      process.stdout.write(output);
      prevLineCount = lines.length;
    }
  }

  function hasSpinners(): boolean {
    for (const node of nodeByUrn.values()) {
      if (node.status === "active" || node.status === "health") return true;
    }
    return false;
  }

  function start() {
    if (isTTY) {
      process.stdout.write(hideCursor);
      render();
      timer = setInterval(() => {
        frame++;
        if (hasSpinners()) render();
      }, TICK_MS);
    } else {
      // Non-TTY: print initial state
      for (const node of nodeByUrn.values()) {
        console.log(`○ ${node.label}`);
      }
    }
  }

  function onEvent(event: ApplyEvent) {
    const node = nodeByUrn.get(event.urn);
    if (!node) return;

    if (event.status === "pending") {
      node.status = "active";
    } else if (event.status === "failed") {
      node.status = "failed";
      const msg =
        event.error instanceof Error
          ? event.error.message
          : String(event.error);
      node.suffix = msg;
    } else {
      node.status = "done";
    }

    if (isTTY) {
      render();
    } else if (event.status === "committed") {
      console.log(`● ${node.label}`);
    } else if (event.status === "failed") {
      console.log(`● ${node.label} failed`);
    }
  }

  function onHealthStatus(
    urnValue: string,
    health: "starting" | "healthy" | "unhealthy",
  ) {
    const node = nodeByUrn.get(urnValue);
    if (!node) return;

    switch (health) {
      case "starting":
        node.status = "health";
        break;
      case "healthy":
        node.status = "done";
        break;
      case "unhealthy":
        node.status = "failed";
        break;
    }

    if (isTTY) {
      render();
    } else {
      console.log(
        `${health === "healthy" ? "●" : "○"} ${node.label} ${health}`,
      );
    }
  }

  function setSuffix(urnValue: string, text: string) {
    const node = nodeByUrn.get(urnValue);
    if (node) {
      node.suffix = text;
      if (isTTY) render();
    }
  }

  function setStatus(urnValue: string, status: NodeStatus) {
    const node = nodeByUrn.get(urnValue);
    if (node) {
      node.status = status;
      if (isTTY) render();
    }
  }

  function stop() {
    stopped = true;
    if (timer) clearInterval(timer);
    if (isTTY) {
      render();
      process.stdout.write(showCursor);
    }
  }

  // Restore cursor on unexpected exit
  if (isTTY) {
    const restore = () => process.stdout.write(showCursor);
    process.on("exit", restore);
  }

  return { start, stop, onEvent, onHealthStatus, setSuffix, setStatus };
}
