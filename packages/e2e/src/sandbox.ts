import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const VYFT_CLI = join(__dirname, "../../vyft/dist/index.js");
const PACKAGES_DIR = join(__dirname, "../..");

/**
 * Clean up any stale e2e docker resources from previous interrupted runs.
 * Call this before running tests.
 */
export async function cleanupStaleResources(): Promise<void> {
  const cleanup = (cmd: string) =>
    exec(cmd, { cwd: process.cwd() }).catch(() => {});

  await cleanup(
    'docker ps -aq --filter "name=vyft-vyft-e2e" | xargs -r docker rm -f',
  );
  await cleanup(
    'docker network ls -q --filter "name=vyft-vyft-e2e" | xargs -r docker network rm',
  );
  await cleanup(
    'docker volume ls -q --filter "name=vyft-vyft-e2e" | xargs -r docker volume rm',
  );
}

// =============================================================================
// Types
// =============================================================================

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface Change {
  resource: string;
  action: "create" | "update" | "delete";
}

export interface DiffResult {
  hasDrift: boolean;
  resources: Array<{
    id: string;
    status: "missing" | "drifted" | "extra";
  }>;
}

export interface OutputResult {
  [resourceId: string]: {
    host?: string;
    port?: number;
    url?: string;
    [key: string]: unknown;
  };
}

export interface Sandbox extends AsyncDisposable {
  /** Unique ID for this sandbox */
  id: string;

  /** Temp directory path */
  tmpDir: string;

  /** Filesystem operations */
  fs: {
    write(path: string, content: string | object): Promise<void>;
    read(path: string): Promise<string>;
    exists(path: string): Promise<boolean>;
    rm(path: string): Promise<void>;
  };

  /** Vyft CLI operations */
  vyft: {
    deploy(opts?: { verbose?: boolean; refresh?: boolean }): Promise<void>;
    destroy(opts?: { verbose?: boolean }): Promise<void>;
    refresh(): Promise<void>;
    diff(): Promise<DiffResult>;

    context: {
      add(
        name: string,
        opts: { platform: string; runtime: string },
      ): Promise<void>;
      use(name: string): Promise<void>;
      remove(name: string): Promise<void>;
      list(): Promise<ExecResult>;
    };

    /** Run raw vyft command */
    raw(args: string): Promise<ExecResult>;
  };

  /** Execute shell command */
  exec(command: string): Promise<ExecResult>;

  /** Manual cleanup (called automatically with `using`) */
  cleanup(): Promise<void>;
}

// =============================================================================
// Exec helper
// =============================================================================

function exec(
  command: string,
  opts: { cwd: string; env?: Record<string, string> },
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const env = { ...process.env, ...opts.env };
    const child = spawn("sh", ["-c", command], { cwd: opts.cwd, env });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

// =============================================================================
// Sandbox factory
// =============================================================================

export interface SandboxOptions {
  /** Environment variables */
  env?: Record<string, string>;
}

export async function sandbox(opts: SandboxOptions = {}): Promise<Sandbox> {
  const id = randomUUID().slice(0, 8);
  const tmpDir = join(tmpdir(), `vyft-e2e-${id}`);
  await mkdir(tmpDir, { recursive: true });
  const vyftRoot = join(tmpDir, ".vyft");

  // Clean up any orphan containers from previous runs
  await exec(
    'docker ps -aq --filter "name=vyft-vyft-e2e" | xargs -r docker rm -f',
    { cwd: tmpDir },
  ).catch(() => {});

  // Create node_modules symlinks so config files can import packages
  const nodeModules = join(tmpDir, "node_modules");
  const scopedDir = join(nodeModules, "@vyft");
  await mkdir(scopedDir, { recursive: true });
  await symlink(join(PACKAGES_DIR, "vyft"), join(nodeModules, "vyft"));
  await symlink(join(PACKAGES_DIR, "core"), join(scopedDir, "core"));
  await symlink(join(PACKAGES_DIR, "docker"), join(scopedDir, "docker"));
  await symlink(join(PACKAGES_DIR, "provider"), join(scopedDir, "provider"));
  await symlink(join(PACKAGES_DIR, "engine"), join(scopedDir, "engine"));
  await symlink(join(PACKAGES_DIR, "errors"), join(scopedDir, "errors"));
  await symlink(join(PACKAGES_DIR, "runtime"), join(scopedDir, "runtime"));
  await symlink(join(PACKAGES_DIR, "store"), join(scopedDir, "store"));

  // Symlink zod from a package that depends on it (pnpm doesn't hoist)
  await symlink(
    join(PACKAGES_DIR, "core", "node_modules", "zod"),
    join(nodeModules, "zod"),
  );

  const env: Record<string, string> = {
    VYFT_PASSPHRASE: "test-passphrase",
    VYFT_ROOT: vyftRoot,
    ...opts.env,
  };

  // Vyft CLI executor
  const vyftExec = async (args: string): Promise<ExecResult> => {
    return exec(`node ${VYFT_CLI} ${args}`, {
      cwd: tmpDir,
      env: { ...env, NODE_PATH: PACKAGES_DIR },
    });
  };

  // Create default context
  const contextResult = await vyftExec(
    `context add ${id} --platform test --runtime docker`,
  );
  if (contextResult.code !== 0) {
    throw new Error(`Failed to create context: ${contextResult.stderr}`);
  }

  // Cleanup function
  const cleanup = async () => {
    // Destroy resources
    try {
      await vyftExec("destroy");
    } catch {
      // Best effort
    }

    // Remove context
    try {
      await vyftExec(`context remove ${id}`);
    } catch {
      // Context may not exist
    }

    // Remove temp directory
    await rm(tmpDir, { recursive: true, force: true });
  };

  const box: Sandbox = {
    id,
    tmpDir,

    fs: {
      async write(path: string, content: string | object) {
        const fullPath = join(tmpDir, path);
        await mkdir(dirname(fullPath), { recursive: true });
        const data =
          typeof content === "object"
            ? JSON.stringify(content, null, 2)
            : content;
        await writeFile(fullPath, data);
      },

      async read(path: string) {
        return readFile(join(tmpDir, path), "utf-8");
      },

      async exists(path: string) {
        try {
          await access(join(tmpDir, path));
          return true;
        } catch {
          return false;
        }
      },

      async rm(path: string) {
        await rm(join(tmpDir, path), { recursive: true, force: true });
      },
    },

    vyft: {
      async deploy(deployOpts) {
        const flags: string[] = [];
        if (deployOpts?.verbose) flags.push("--verbose");
        if (deployOpts?.refresh) flags.push("--refresh");
        const result = await vyftExec(`deploy ${flags.join(" ")}`);
        if (result.code !== 0) {
          throw new Error(`deploy failed: ${result.stderr}`);
        }
      },

      async destroy(destroyOpts) {
        const flags = destroyOpts?.verbose ? "--verbose " : "";
        const result = await vyftExec(`destroy ${flags}`);
        if (result.code !== 0) {
          throw new Error(`destroy failed: ${result.stderr}`);
        }
      },

      async refresh() {
        const result = await vyftExec("refresh");
        if (result.code !== 0) {
          throw new Error(`refresh failed: ${result.stderr}`);
        }
      },

      async diff() {
        const result = await vyftExec("diff");
        if (result.code > 1) {
          throw new Error(`diff failed: ${result.stderr || result.stdout}`);
        }

        const resources: DiffResult["resources"] = [];
        // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI escape sequences
        const stripped = result.stdout.replace(/\x1b\[[0-9;]*m/g, "");
        const lines = stripped.split("\n");
        for (const line of lines) {
          const missingMatch = line.match(/\bmissing (\S+)/);
          if (missingMatch?.[1]) {
            resources.push({ id: missingMatch[1], status: "missing" });
          }
          const driftMatch = line.match(/\bdrift (\S+)/);
          if (driftMatch?.[1] && !line.includes("no drift")) {
            resources.push({ id: driftMatch[1], status: "drifted" });
          }
        }

        return {
          hasDrift: result.code === 1,
          resources,
        };
      },

      context: {
        async add(name, addOpts) {
          const result = await vyftExec(
            `context add ${name} --platform ${addOpts.platform} --runtime ${addOpts.runtime}`,
          );
          if (result.code !== 0) {
            throw new Error(`context add failed: ${result.stderr}`);
          }
        },

        async use(name) {
          const result = await vyftExec(`context use ${name}`);
          if (result.code !== 0) {
            throw new Error(`context use failed: ${result.stderr}`);
          }
        },

        async remove(name) {
          const result = await vyftExec(`context remove ${name}`);
          if (result.code !== 0) {
            throw new Error(`context remove failed: ${result.stderr}`);
          }
        },

        async list() {
          return vyftExec("context list");
        },
      },

      async raw(args) {
        return vyftExec(args);
      },
    },

    async exec(command) {
      return exec(command, { cwd: tmpDir, env });
    },

    cleanup,

    async [Symbol.asyncDispose]() {
      await cleanup();
    },
  };

  return box;
}
