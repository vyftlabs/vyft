import fs from "node:fs/promises";
import path from "node:path";
import { type Provider, type ResourceEntry, urn } from "@vyft/core";
import { service } from "@vyft/runtime";
import { createJiti } from "jiti";

const CONFIG_FILES = [
  "vyft.config.ts",
  "vyft.config.js",
  "vyft.config.mjs",
  "vyft.config.mts",
];

function isResourceEntry(value: unknown): value is ResourceEntry {
  return (
    typeof value === "object" &&
    value !== null &&
    "urn" in value &&
    typeof (value as Record<string, unknown>)["urn"] === "string" &&
    "value" in value
  );
}

export interface LoadedConfig {
  entries: ResourceEntry[];
  providers: Record<string, Provider<unknown>>;
}

function collectProviders(
  entries: ResourceEntry[],
): Record<string, Provider<unknown>> {
  const providers: Record<string, Provider<unknown>> = {};
  for (const entry of entries) {
    const { provider: name } = urn.parse(entry.urn);
    if (!providers[name]) {
      providers[name] = entry.provider;
    }
  }
  return providers;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function loadConfig(
  cwd: string,
  name?: string,
): Promise<LoadedConfig> {
  const jiti = createJiti(cwd);

  for (const file of CONFIG_FILES) {
    const filePath = path.join(cwd, file);
    if (!(await fileExists(filePath))) continue;

    const mod = (await jiti.import(filePath)) as Record<string, unknown>;

    const entries: ResourceEntry[] = [];
    for (const value of Object.values(mod)) {
      if (isResourceEntry(value)) {
        entries.push(value);
      }
    }
    return { entries, providers: collectProviders(entries) };
  }

  if (name) {
    const entry = service(name, {});
    const entries = [entry];
    return { entries, providers: collectProviders(entries) };
  }

  throw new Error(
    `No config file found. Create one of: ${CONFIG_FILES.join(", ")}, or pass --name <name>.`,
  );
}

export async function resolveName(
  cwd: string,
  override?: string,
): Promise<string> {
  if (override) return override;

  try {
    const raw = await fs.readFile(path.join(cwd, "package.json"), "utf8");
    const pkg = JSON.parse(raw) as { name?: string };
    if (pkg.name) {
      const stripped = pkg.name.replace(/^@[^/]+\//, "");
      if (stripped) return stripped;
    }
  } catch {}

  throw new Error(
    'Could not determine project name. Add a "name" field to package.json or use --name <name>.',
  );
}
