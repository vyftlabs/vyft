import fs from "node:fs/promises";
import path from "node:path";

function templatesDir(): string {
  return path.resolve(import.meta.dirname, "..", "..", "templates");
}

export async function listTemplates(): Promise<string[]> {
  const entries = await fs.readdir(templatesDir(), { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

export async function copyTemplate(template: string, dest: string) {
  const src = path.join(templatesDir(), template);
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const srcFile = path.join(src, entry.name);
    const destFile = path.join(dest, entry.name);

    if (entry.name === "package.json") {
      const raw = await fs.readFile(srcFile, "utf8");
      const pkg = JSON.parse(raw) as Record<string, unknown>;
      pkg["name"] = path.basename(dest);
      await fs.writeFile(destFile, `${JSON.stringify(pkg, null, 2)}\n`);
    } else {
      await fs.copyFile(srcFile, destFile);
    }
  }
}
