import path from "node:path";
import { fileExists } from "./fs.ts";

export type PackageManager = "pnpm" | "yarn" | "bun" | "npm";

const LOCK_FILES: [string, PackageManager][] = [
  ["pnpm-lock.yaml", "pnpm"],
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
  ["yarn.lock", "yarn"],
  ["package-lock.json", "npm"],
];

export async function detectPackageManager(
  cwd: string,
): Promise<PackageManager> {
  for (const [file, pm] of LOCK_FILES) {
    if (await fileExists(path.join(cwd, file))) return pm;
  }
  return "npm";
}
