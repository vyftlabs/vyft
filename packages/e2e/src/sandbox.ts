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

// =============================================================================
// Types
// =============================================================================

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface Sandbox extends AsyncDisposable {
  id: string;
  project: string;
  tmpDir: string;

  fs: {
    write(path: string, content: string | object): Promise<void>;
    read(path: string): Promise<string>;
    exists(path: string): Promise<boolean>;
    rm(path: string): Promise<void>;
  };

  /** Write a vyft.config.ts file */
  writeConfig(code: string): Promise<void>;

  vyft: {
    raw(args: string): Promise<ExecResult>;
  };

  runtime: {
    /** Assert a container with the given resource name is running */
    assertRunning(name: string): Promise<void>;
    /** Assert no containers exist for this sandbox's project */
    assertNone(): Promise<void>;
    /** Get the container ID for a resource name */
    getId(name: string): Promise<string>;
    /** List container names for this sandbox's project */
    list(): Promise<string[]>;
  };

  exec(command: string): Promise<ExecResult>;
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
// Helpers
// =============================================================================

function dockerFilter(project: string): string {
  return `docker ps -a --filter "label=vyft.managed=true" --filter "name=vyft-${project}" --format "{{.Names}}"`;
}

function dockerId(project: string, name: string): string {
  return `docker ps --filter "name=vyft-${project}-production-${name}" --format "{{.ID}}"`;
}

// =============================================================================
// Sandbox factory
// =============================================================================

export interface SandboxOptions {
  env?: Record<string, string>;
}

export async function sandbox(opts: SandboxOptions = {}): Promise<Sandbox> {
  const id = randomUUID().slice(0, 8);
  const project = `e2e-${id}`;
  const tmpDir = join(tmpdir(), `vyft-e2e-${id}`);
  await mkdir(tmpDir, { recursive: true });
  const vyftRoot = join(tmpDir, ".vyft");

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

  // Write package.json with unique project name
  await writeFile(
    join(tmpDir, "package.json"),
    JSON.stringify({ name: project }),
  );

  const env: Record<string, string> = {
    VYFT_PASSPHRASE: "test-passphrase",
    VYFT_ROOT: vyftRoot,
    ...opts.env,
  };

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

  const cleanup = async () => {
    try {
      await vyftExec("destroy");
    } catch {
      // Best effort
    }

    // Force-remove any leftover containers and network
    await exec(
      `docker ps -aq --filter "name=vyft-${project}" | xargs -r docker rm -f`,
      { cwd: tmpDir },
    ).catch(() => {});
    await exec(`docker network rm vyft-${project}-production`, {
      cwd: tmpDir,
    }).catch(() => {});

    try {
      await vyftExec(`context remove ${id}`);
    } catch {
      // Context may not exist
    }
    await rm(tmpDir, { recursive: true, force: true });
  };

  const box: Sandbox = {
    id,
    project,
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

    async writeConfig(code: string) {
      await writeFile(join(tmpDir, "vyft.config.ts"), code);
    },

    vyft: {
      async raw(args) {
        return vyftExec(args);
      },
    },

    runtime: {
      async assertRunning(name: string) {
        const result = await exec(dockerId(project, name), { cwd: tmpDir });
        const cid = result.stdout.trim();
        if (!cid) {
          throw new Error(`Expected container "${name}" to be running but it was not found`);
        }
      },

      async assertNone() {
        const result = await exec(dockerFilter(project), { cwd: tmpDir });
        const output = result.stdout.trim();
        if (output) {
          throw new Error(`Expected no containers but found: ${output}`);
        }
      },

      async getId(name: string) {
        const result = await exec(dockerId(project, name), { cwd: tmpDir });
        const cid = result.stdout.trim();
        if (!cid) {
          throw new Error(`Container "${name}" not found`);
        }
        return cid;
      },

      async list() {
        const result = await exec(dockerFilter(project), { cwd: tmpDir });
        const output = result.stdout.trim();
        if (!output) return [];
        return output.split("\n").sort();
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
