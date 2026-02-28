import {
  access,
  appendFile,
  mkdir,
  readFile,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { VyftError } from "../errors.ts";
import type {
  PersistedState,
  ResourceState,
  Store,
  WALEntry,
} from "./types.ts";

export class LockError extends VyftError {}

function statePath(root: string, context: string, project: string): string {
  return join(root, context, project, "state.json");
}

function lockPath(root: string, context: string, project: string): string {
  return join(root, context, project, "lock");
}

function dirPath(root: string, context: string, project: string): string {
  return join(root, context, project);
}

function walPath(root: string, context: string, project: string): string {
  return join(root, context, project, "wal.jsonl");
}

/** Create a file-backed Store rooted at the given directory (typically `.vyft/`). */
export function createFileStore(root: string): Store {
  return {
    async load(context, project) {
      let state: PersistedState | null = null;
      try {
        const raw = await readFile(statePath(root, context, project), "utf8");
        state = JSON.parse(raw) as PersistedState;
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      }

      // Read and replay WAL if present
      let walRaw: string;
      try {
        walRaw = await readFile(walPath(root, context, project), "utf8");
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return state;
        throw err;
      }

      const resources = new Map<string, ResourceState>();
      if (state) {
        for (const r of state.resources) resources.set(r.id, r);
      }

      for (const line of walRaw.split("\n")) {
        if (!line.trim()) continue;
        let entry: WALEntry;
        try {
          entry = JSON.parse(line) as WALEntry;
        } catch {
          break; // Malformed last line = crash mid-append, discard
        }
        if (entry.type === "committed") {
          resources.set(entry.id, entry.state);
        } else if (entry.type === "removed") {
          resources.delete(entry.id);
        }
      }

      return {
        version: state?.version ?? 1,
        manifest: state?.manifest ?? {
          timestamp: new Date().toISOString(),
          tool: "vyft",
        },
        resources: [...resources.values()],
        secrets: state?.secrets ?? null,
      };
    },

    async save(context, project, state) {
      const dir = dirPath(root, context, project);
      await mkdir(dir, { recursive: true });
      const dest = statePath(root, context, project);
      const tmp = join(dir, ".state.json.tmp");
      await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`, "utf8");
      await rename(tmp, dest);
    },

    async delete(context, project) {
      const dir = dirPath(root, context, project);
      await rm(dir, { recursive: true, force: true });
    },

    async lock(context, project) {
      const dir = dirPath(root, context, project);
      await mkdir(dir, { recursive: true });
      const file = lockPath(root, context, project);
      const payload = JSON.stringify({
        pid: process.pid,
        timestamp: new Date().toISOString(),
      });
      try {
        await writeFile(file, payload, { flag: "wx" });
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;

        // Lock file exists — check whether the holder is still alive
        const existing = JSON.parse(await readFile(file, "utf8")) as {
          pid: number;
        };
        if (isProcessAlive(existing.pid)) {
          throw new LockError(
            `State is locked by PID ${existing.pid}. The process is still running.`,
          );
        }

        throw new LockError(
          `State is locked by a non-running process (PID ${existing.pid}). ` +
            `Run \`vyft cancel\` to clear the stale lock.`,
        );
      }

      return async () => {
        await unlink(file).catch(() => {});
      };
    },

    async inspectLock(context, project) {
      try {
        const raw = await readFile(lockPath(root, context, project), "utf8");
        return JSON.parse(raw) as { pid: number; timestamp: string };
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
      }
    },

    async clearLock(context, project) {
      await unlink(lockPath(root, context, project)).catch((err: unknown) => {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      });
    },

    async hasWAL(context, project) {
      try {
        await access(walPath(root, context, project));
        return true;
      } catch {
        return false;
      }
    },

    async appendLog(context, project, entry) {
      const dir = dirPath(root, context, project);
      await mkdir(dir, { recursive: true });
      await appendFile(
        walPath(root, context, project),
        `${JSON.stringify(entry)}\n`,
        "utf8",
      );
    },

    async compact(context, project, state) {
      const dir = dirPath(root, context, project);
      const dest = statePath(root, context, project);
      const tmp = join(dir, ".state.json.tmp");
      await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`, "utf8");
      await rename(tmp, dest);
      await unlink(walPath(root, context, project)).catch(() => {});
    },
  };
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
