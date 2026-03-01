import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** Parse `.env` file content into key-value pairs. */
export function parseEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Strip optional `export ` prefix
    const stripped = trimmed.startsWith("export ")
      ? trimmed.slice(7).trimStart()
      : trimmed;

    const eq = stripped.indexOf("=");
    if (eq === -1) continue;

    const key = stripped.slice(0, eq).trim();
    let value = stripped.slice(eq + 1).trim();

    // Remove matching quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }
  return result;
}

/** Load a `.env` file from `dir` into `process.env`. Existing values are not overridden. */
export async function loadEnv(dir: string): Promise<void> {
  let content: string;
  try {
    content = await readFile(join(dir, ".env"), "utf8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }

  const parsed = parseEnv(content);
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
