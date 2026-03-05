import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { VyftError } from "@vyft/errors";
import { createJiti } from "jiti";
import { loadEnv } from "./env.ts";

export const RUNTIMES = ["docker", "swarm", "k8s"] as const;
export type RuntimeName = (typeof RUNTIMES)[number];

export interface ContextConfig {
  readonly runtime: RuntimeName;
}

function contextConfigPath(root: string, context: string): string {
  return join(root, context, "config.json");
}

/** Read the config for a context. Returns null if the context has no config. */
export async function loadContextConfig(
  root: string,
  context: string,
): Promise<ContextConfig | null> {
  try {
    const raw = await readFile(contextConfigPath(root, context), "utf8");
    return JSON.parse(raw) as ContextConfig;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/** Persist the config for a context. */
export async function saveContextConfig(
  root: string,
  context: string,
  config: ContextConfig,
): Promise<void> {
  const dir = join(root, context);
  await mkdir(dir, { recursive: true });
  await writeFile(
    contextConfigPath(root, context),
    `${JSON.stringify(config, null, 2)}\n`,
    "utf8",
  );
}

const CONFIG_FILES = ["vyft.config.ts", "vyft.config.js", "vyft.config.mjs"];

/** Locate the config file in a directory. Throws if not found. */
export async function findConfig(dir: string): Promise<string> {
  for (const name of CONFIG_FILES) {
    const path = resolve(dir, name);
    try {
      await stat(path);
      return path;
    } catch {}
  }
  throw new VyftError(
    `No config file found. Create one of: ${CONFIG_FILES.join(", ")}`,
  );
}

/** Load and execute a config file. Returns the raw module for collect(). */
export async function loadConfig(path: string): Promise<unknown> {
  await loadEnv(dirname(path));
  const jiti = createJiti(import.meta.url, { requireCache: false });
  return jiti.import(path);
}

/**
 * Resolve the active context name.
 *
 * 1. `VYFT_CONTEXT` env var
 * 2. `.vyft/active` file
 * 3. `"default"`
 */
export async function resolveContext(root: string): Promise<string> {
  const env = process.env["VYFT_CONTEXT"];
  if (env) return env;

  try {
    const active = await readFile(join(root, "active"), "utf8");
    const trimmed = active.trim();
    if (trimmed) return trimmed;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  return "default";
}

/**
 * Resolve the active stage name.
 *
 * 1. `VYFT_STAGE` env var
 * 2. `.vyft/stages/active` file
 * 3. `"local"`
 */
export async function resolveStage(root: string): Promise<string> {
  const env = process.env["VYFT_STAGE"];
  if (env) return env;

  try {
    const active = await readFile(join(root, "stages", "active"), "utf8");
    const trimmed = active.trim();
    if (trimmed) return trimmed;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  return "local";
}

/** Resolve the vyft state root directory for a project: `~/.vyft/<project>/`. */
export function vyftRoot(project: string): string {
  return join(process.env["VYFT_ROOT"] ?? join(homedir(), ".vyft"), project);
}

export interface ProjectInfo {
  readonly cwd: string;
  readonly root: string;
  readonly context: string;
  readonly stage: string;
  readonly project: string;
  readonly runtimeName: RuntimeName;
}

/** Resolve standard project identifiers from cwd. */
export async function projectInfo(): Promise<ProjectInfo> {
  const cwd = process.cwd();
  const project = basename(cwd);
  const root = vyftRoot(project);
  const context = await resolveContext(root);
  const stage = await resolveStage(root);

  let ctxConfig = await loadContextConfig(root, context);
  if (!ctxConfig) {
    if (context === "default") {
      ctxConfig = { runtime: "docker" };
      await saveContextConfig(root, context, ctxConfig);
    } else {
      throw new VyftError(
        `Context "${context}" has no config. Run \`vyft context create ${context} --runtime docker\` first.`,
      );
    }
  }

  return { cwd, root, context, stage, project, runtimeName: ctxConfig.runtime };
}
