import fs from "node:fs/promises";

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function isEmptyDir(dir: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(dir);
    return entries.length === 0;
  } catch {
    return true;
  }
}

export async function addGitignoreEntry(dir: string) {
  const path = await import("node:path");
  const gitignorePath = path.join(dir, ".gitignore");
  try {
    const content = await fs.readFile(gitignorePath, "utf8");
    if (!content.includes(".vyft")) {
      await fs.appendFile(gitignorePath, "\n.vyft/\n");
    }
  } catch {
    await fs.writeFile(gitignorePath, ".vyft/\n");
  }
}
