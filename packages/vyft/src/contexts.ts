import fs from "node:fs/promises";
import path from "node:path";

export interface ContextEntry {
  platform: string;
  runtime: string;
  connection?: {
    host?: string | undefined;
    endpoint?: string | undefined;
  } | undefined;
}

export interface ContextsFile {
  current?: string;
  contexts: Record<string, ContextEntry>;
}

const VYFT_DIR = ".vyft";
const CONTEXTS_FILE = "vyft.json";

function contextsPath(cwd: string): string {
  return path.join(cwd, VYFT_DIR, CONTEXTS_FILE);
}

export async function readContexts(cwd: string): Promise<ContextsFile> {
  try {
    const raw = await fs.readFile(contextsPath(cwd), "utf8");
    return JSON.parse(raw) as ContextsFile;
  } catch {
    return { contexts: {} };
  }
}

async function writeContexts(cwd: string, data: ContextsFile): Promise<void> {
  const dir = path.join(cwd, VYFT_DIR);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(contextsPath(cwd), JSON.stringify(data, null, 2));
}

export async function addContext(
  cwd: string,
  name: string,
  entry: ContextEntry,
): Promise<void> {
  const data = await readContexts(cwd);
  if (data.contexts[name]) {
    throw new Error(`Context "${name}" already exists`);
  }
  data.contexts[name] = entry;
  if (!data.current) {
    data.current = name;
  }
  await writeContexts(cwd, data);
}

export async function removeContext(cwd: string, name: string): Promise<void> {
  const data = await readContexts(cwd);
  if (!data.contexts[name]) {
    throw new Error(`Context "${name}" does not exist`);
  }
  delete data.contexts[name];
  if (data.current === name) {
    const remaining = Object.keys(data.contexts);
    const next = remaining[0];
    if (next) {
      data.current = next;
    } else {
      delete data.current;
    }
  }
  await writeContexts(cwd, data);
}

export async function useContext(cwd: string, name: string): Promise<void> {
  const data = await readContexts(cwd);
  if (!data.contexts[name]) {
    throw new Error(`Context "${name}" does not exist`);
  }
  data.current = name;
  await writeContexts(cwd, data);
}

const DEFAULT_CONTEXT: ContextEntry = {
  platform: "remote",
  runtime: "docker",
};

export async function getCurrentContext(
  cwd: string,
): Promise<{ name: string; entry: ContextEntry }> {
  const data = await readContexts(cwd);

  const name = data.current;
  const entry = name ? data.contexts[name] : undefined;
  if (!name || !entry) {
    return { name: "default", entry: DEFAULT_CONTEXT };
  }

  return { name, entry };
}
