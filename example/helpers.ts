import { promises as fs } from "fs";
import * as path from "path";

export interface PackageJson {
  name?: string;
  version?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
}

type PackageManager = "npm" | "yarn" | "pnpm" | "bun";

export async function resolvePackageJson(
  startPath: string = process.cwd(),
): Promise<{ manifest: PackageJson; path: string }> {
  let dir = path.resolve(startPath);

  while (true) {
    const packageJsonPath = path.join(dir, "package.json");
    try {
      const content = await fs.readFile(packageJsonPath, "utf8");
      return { manifest: JSON.parse(content) as PackageJson, path: dir };
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code?: string }).code === "ENOENT"
      ) {
        const parentDir = path.dirname(dir);
        if (parentDir === dir) {
          throw new Error(`No package.json found (searched up from ${startPath})`);
        }
        dir = parentDir;
      } else {
        throw err;
      }
    }
  }
}

export async function resolvePackageManager(
  cwd: string = process.cwd(),
): Promise<PackageManager> {
  const checks: { manager: PackageManager; file: string }[] = [
    { manager: "bun", file: "bun.lockb" },
    { manager: "pnpm", file: "pnpm-lock.yaml" },
    { manager: "yarn", file: "yarn.lock" },
    { manager: "npm", file: "package-lock.json" },
  ];

  for (const { manager, file } of checks) {
    try {
      await fs.access(path.join(cwd, file));
      return manager;
    } catch {}
  }

  throw new Error(`No package manager lockfile found in ${cwd}`);
}

