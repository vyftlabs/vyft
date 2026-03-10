import fs from "node:fs/promises";
import path from "node:path";

export interface DetectedDev {
  command: string[];
  cwd: string;
  include: string[];
}

type JSRuntime = "bun" | "pnpm" | "yarn" | "npm";

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function detectJSRuntime(dir: string): Promise<JSRuntime> {
  if (await fileExists(path.join(dir, "bun.lock"))) return "bun";
  if (await fileExists(path.join(dir, "pnpm-lock.yaml"))) return "pnpm";
  if (await fileExists(path.join(dir, "yarn.lock"))) return "yarn";
  return "npm";
}

async function findProjectRoot(
  startDir: string,
  markers: string[],
): Promise<string | null> {
  let dir = startDir;
  while (true) {
    for (const marker of markers) {
      if (await fileExists(path.join(dir, marker))) return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

async function detectFromFile(filePath: string): Promise<DetectedDev | null> {
  const ext = path.extname(filePath);
  const dir = path.dirname(filePath);

  if (ext === ".ts" || ext === ".js") {
    const root = await findProjectRoot(dir, ["package.json"]);
    if (!root) return null;
    const runtime = await detectJSRuntime(root);
    const relFile = path.relative(root, filePath);
    const command =
      runtime === "bun"
        ? ["bun", "run", relFile]
        : ext === ".ts"
          ? ["tsx", relFile]
          : ["node", relFile];
    return { command, cwd: root, include: ["**/*.{ts,js,json}"] };
  }

  if (ext === ".py") {
    const root = await findProjectRoot(dir, [
      "pyproject.toml",
      "requirements.txt",
    ]);
    if (!root) return null;
    return {
      command: ["python", path.relative(root, filePath)],
      cwd: root,
      include: ["**/*.py"],
    };
  }

  if (ext === ".go") {
    const root = await findProjectRoot(dir, ["go.mod"]);
    if (!root) return null;
    return {
      command: ["go", "run", path.relative(root, filePath)],
      cwd: root,
      include: ["**/*.go"],
    };
  }

  if (ext === ".rs") {
    const root = await findProjectRoot(dir, ["Cargo.toml"]);
    if (!root) return null;
    return { command: ["cargo", "run"], cwd: root, include: ["**/*.rs"] };
  }

  return null;
}

async function detectFromDir(dirPath: string): Promise<DetectedDev | null> {
  const pkgPath = path.join(dirPath, "package.json");
  if (await fileExists(pkgPath)) {
    let pkg: Record<string, unknown> = {};
    try {
      pkg = JSON.parse(await fs.readFile(pkgPath, "utf8")) as Record<
        string,
        unknown
      >;
    } catch {}
    const runtime = await detectJSRuntime(dirPath);
    const pm =
      runtime === "bun"
        ? "bun"
        : runtime === "pnpm"
          ? "pnpm"
          : runtime === "yarn"
            ? "yarn"
            : "npm";
    const scripts = pkg["scripts"] as Record<string, string> | undefined;
    if (scripts?.["dev"]) {
      return {
        command: [pm, "run", "dev"],
        cwd: dirPath,
        include: ["**/*.{ts,js,json}"],
      };
    }
    if (scripts?.["start"]) {
      return {
        command: [pm, "run", "start"],
        cwd: dirPath,
        include: ["**/*.{ts,js,json}"],
      };
    }
  }

  if (await fileExists(path.join(dirPath, "go.mod"))) {
    return {
      command: ["go", "run", "."],
      cwd: dirPath,
      include: ["**/*.go"],
    };
  }

  if (await fileExists(path.join(dirPath, "Cargo.toml"))) {
    return { command: ["cargo", "run"], cwd: dirPath, include: ["**/*.rs"] };
  }

  if (await fileExists(path.join(dirPath, "pyproject.toml"))) {
    return {
      command: ["uv", "run", "dev"],
      cwd: dirPath,
      include: ["**/*.py"],
    };
  }

  return null;
}

export async function detectDev(
  servicePath: string,
  configCwd: string,
): Promise<DetectedDev | null> {
  const absPath = path.resolve(configCwd, servicePath);

  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stat = await fs.stat(absPath);
  } catch {
    return null;
  }

  if (stat.isFile()) {
    return detectFromFile(absPath);
  }

  return detectFromDir(absPath);
}
