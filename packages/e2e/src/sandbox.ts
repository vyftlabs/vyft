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
export const VYFT_CLI = join(__dirname, "../../vyft/dist/cli.js");
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
    preview(): Promise<Change[]>;
    refresh(opts?: { clearPending?: boolean }): Promise<void>;
    diff(): Promise<DiffResult>;
    output(
      id?: string,
      opts?: { showSecrets?: boolean },
    ): Promise<OutputResult>;

    config: {
      set(
        key: string,
        value: string,
        opts?: { secret?: boolean },
      ): Promise<void>;
      get(key: string): Promise<string | undefined>;
      rm(key: string): Promise<void>;
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

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
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
  // Use box.id in the temp dir name so project name (from directory basename) is consistent
  // Container naming: vyft-{project}-{stage}-{resource} where project = "vyft-e2e-{id}", stage = "{id}"
  // This makes the filter "name=vyft-vyft-e2e-{id}" work correctly
  const tmpDir = await mkdir(join(tmpdir(), `vyft-e2e-${id}`), {
    recursive: true,
  }).then(() => join(tmpdir(), `vyft-e2e-${id}`));
  const vyftRoot = join(tmpDir, ".vyft");

  // Clean up any orphan containers from previous runs that might be using our ports
  await exec(
    'docker ps -aq --filter "name=vyft-vyft-e2e" | xargs -r docker rm -f',
    { cwd: tmpDir },
  ).catch(() => {});

  // Create node_modules symlinks so config files can import from "vyft"
  // Also link typescript for type checking in tests
  const nodeModules = join(tmpDir, "node_modules");
  const nodeModulesBin = join(nodeModules, ".bin");
  await mkdir(nodeModulesBin, { recursive: true });
  await symlink(join(PACKAGES_DIR, "vyft"), join(nodeModules, "vyft"));
  // Link typescript from the monorepo's node_modules
  const rootNodeModules = join(PACKAGES_DIR, "..", "node_modules");
  await symlink(
    join(rootNodeModules, "typescript"),
    join(nodeModules, "typescript"),
  );
  await symlink(
    join(rootNodeModules, ".bin", "tsc"),
    join(nodeModulesBin, "tsc"),
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

  // Create context and stage
  const contextResult = await vyftExec(`context create ${id} --runtime docker`);
  if (contextResult.code !== 0) {
    throw new Error(`Failed to create context: ${contextResult.stderr}`);
  }

  const stageResult = await vyftExec(`stage create ${id}`);
  if (stageResult.code !== 0) {
    throw new Error(`Failed to create stage: ${stageResult.stderr}`);
  }

  // Cleanup function
  const cleanup = async () => {
    // Destroy resources
    try {
      await vyftExec("destroy --yes");
    } catch {
      // Best effort
    }

    // Remove context
    try {
      await vyftExec(`context rm ${id}`);
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
        const result = await vyftExec(`destroy --yes ${flags}`);
        if (result.code !== 0) {
          throw new Error(`destroy failed: ${result.stderr}`);
        }
      },

      async preview() {
        const result = await vyftExec("preview -o json");
        if (result.code !== 0) {
          throw new Error(`preview failed: ${result.stderr}`);
        }
        const parsed = JSON.parse(result.stdout) as Array<{
          resource: string;
          kind: string;
          action: "create" | "update" | "delete";
        }>;
        return parsed.map((p) => ({ resource: p.resource, action: p.action }));
      },

      async refresh(refreshOpts) {
        const flags = refreshOpts?.clearPending ? "--clear-pending " : "";
        const result = await vyftExec(`refresh ${flags}`);
        if (result.code !== 0) {
          throw new Error(`refresh failed: ${result.stderr}`);
        }
      },

      async diff() {
        const result = await vyftExec("diff");
        // Exit code 0 = no drift, 1 = drift detected or error
        // Exit code > 1 = actual error
        if (result.code > 1) {
          throw new Error(`diff failed: ${result.stderr || result.stdout}`);
        }

        // Check for "No state" error (returns code 1 but is an error, not drift)
        if (result.stderr.includes("No state")) {
          throw new Error(result.stderr.trim());
        }

        // Parse output for resource status
        // Log format: "HH:MM:SS.ms missing|drift resource-id"
        // Must not match "no drift detected"
        const resources: DiffResult["resources"] = [];
        const lines = result.stdout.split("\n");
        for (const line of lines) {
          // Match step output: timestamp + "missing" + resource-id
          const missingMatch = line.match(
            /\d{2}:\d{2}:\d{2}\.\d+ missing (\S+)/,
          );
          if (missingMatch?.[1]) {
            resources.push({ id: missingMatch[1], status: "missing" });
          }
          // Match step output: timestamp + "drift" + resource-id
          const driftMatch = line.match(/\d{2}:\d{2}:\d{2}\.\d+ drift (\S+)/);
          if (driftMatch?.[1]) {
            resources.push({ id: driftMatch[1], status: "drifted" });
          }
        }

        return {
          hasDrift: result.code === 1,
          resources,
        };
      },

      async output(resourceId, outputOpts) {
        const secretsFlag = outputOpts?.showSecrets ? " --show-secrets" : "";
        const cmd = resourceId
          ? `output ${resourceId} --json${secretsFlag}`
          : `output --json${secretsFlag}`;
        const result = await vyftExec(cmd);
        if (result.code !== 0) {
          throw new Error(`output failed: ${result.stderr}`);
        }
        const parsed = JSON.parse(result.stdout);
        return resourceId && parsed[resourceId] ? parsed[resourceId] : parsed;
      },

      config: {
        async set(key, value, setOpts) {
          const flags: string[] = [];
          if (setOpts?.secret) flags.push("--secret");
          const escapedValue = value
            .replace(/\\/g, "\\\\")
            .replace(/"/g, '\\"')
            .replace(/`/g, "\\`")
            .replace(/\$/g, "\\$");
          const result = await vyftExec(
            `config set ${key} "${escapedValue}" ${flags.join(" ")}`,
          );
          if (result.code !== 0) {
            throw new Error(`config set failed: ${result.stderr}`);
          }
        },

        async get(key) {
          const result = await vyftExec(`config get ${key} -o json`);
          if (result.code !== 0) {
            return undefined;
          }
          const data = JSON.parse(result.stdout);
          return data.value;
        },

        async rm(key) {
          const result = await vyftExec(`config rm ${key}`);
          if (result.code !== 0) {
            throw new Error(`config rm failed: ${result.stderr}`);
          }
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

    // AsyncDisposable for `using` keyword
    async [Symbol.asyncDispose]() {
      await cleanup();
    },
  };

  return box;
}
