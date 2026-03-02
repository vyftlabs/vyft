import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type ExecResult, exec as execCmd } from "./cli.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VYFT_CLI = join(__dirname, "../../vyft/dist/cli/index.js");
const PACKAGES_DIR = join(__dirname, "../..");

export interface Change {
  resource: string;
  action: "create" | "update" | "delete";
}

export interface ListResult {
  items: string[];
  active: string | null;
}

export interface ConfigListResult {
  stage: string;
  items: Array<{ name: string; secret: boolean }>;
}

export interface TestContext {
  /** Unique ID for this test run - use for parallel isolation */
  id: string;

  vyft: {
    context: {
      create: (name: string, opts?: { runtime?: string }) => Promise<void>;
      use: (name: string) => Promise<void>;
      ls: () => Promise<ListResult>;
      rm: (name: string) => Promise<void>;
    };
    stage: {
      create: (name: string) => Promise<void>;
      use: (name: string) => Promise<void>;
      ls: () => Promise<ListResult>;
      rm: (name: string) => Promise<void>;
    };
    deploy: () => Promise<void>;
    destroy: () => Promise<void>;
    preview: () => Promise<Change[]>;
    output: (id?: string) => Promise<Record<string, unknown>>;
    config: {
      set: (
        key: string,
        value: string,
        opts?: { secret?: boolean },
      ) => Promise<void>;
      get: (key: string) => Promise<string | undefined>;
      rm: (key: string) => Promise<void>;
      ls: () => Promise<ConfigListResult>;
    };
  };
  exec: (command: string) => Promise<ExecResult>;
}

interface ContextOptions {
  env?: Record<string, string>;
  config?: string;
}

export async function createContext(options: ContextOptions): Promise<{
  ctx: TestContext;
  cleanup: () => Promise<void>;
}> {
  const testId = randomUUID().slice(0, 8);
  const tmpDir = await mkdtemp(join(tmpdir(), "vyft-e2e-"));
  const env = { ...options.env };

  // Write config file if provided
  if (options.config) {
    await writeFile(join(tmpDir, "vyft.config.ts"), options.config);
  }

  const vyftExec = async (args: string): Promise<ExecResult> => {
    // Include NODE_PATH so vyft module can be resolved from temp directories
    const execEnv = {
      ...env,
      NODE_PATH: PACKAGES_DIR,
    };
    return execCmd(`node ${VYFT_CLI} ${args}`, { cwd: tmpDir, env: execEnv });
  };

  // Track created contexts for cleanup
  const createdContexts: string[] = [];

  const ctx: TestContext = {
    id: testId,

    vyft: {
      context: {
        async create(name: string, opts?: { runtime?: string }) {
          const runtime = opts?.runtime ?? "docker";
          const result = await vyftExec(
            `context create ${name} --runtime ${runtime}`,
          );
          if (result.code !== 0) {
            throw new Error(`context create failed: ${result.stderr}`);
          }
          createdContexts.push(name);
        },

        async use(name: string) {
          const result = await vyftExec(`context use ${name}`);
          if (result.code !== 0) {
            throw new Error(`context use failed: ${result.stderr}`);
          }
        },

        async ls() {
          const result = await vyftExec("context ls -o json");
          if (result.code !== 0) {
            throw new Error(`context ls failed: ${result.stderr}`);
          }
          return JSON.parse(result.stdout) as ListResult;
        },

        async rm(name: string) {
          const result = await vyftExec(`context rm ${name}`);
          if (result.code !== 0) {
            throw new Error(`context rm failed: ${result.stderr}`);
          }
        },
      },

      stage: {
        async create(name: string) {
          const result = await vyftExec(`stage create ${name}`);
          if (result.code !== 0) {
            throw new Error(`stage create failed: ${result.stderr}`);
          }
        },

        async use(name: string) {
          const result = await vyftExec(`stage use ${name}`);
          if (result.code !== 0) {
            throw new Error(`stage use failed: ${result.stderr}`);
          }
        },

        async ls() {
          const result = await vyftExec("stage ls -o json");
          if (result.code !== 0) {
            throw new Error(`stage ls failed: ${result.stderr}`);
          }
          return JSON.parse(result.stdout) as ListResult;
        },

        async rm(name: string) {
          const result = await vyftExec(`stage rm ${name}`);
          if (result.code !== 0) {
            throw new Error(`stage rm failed: ${result.stderr}`);
          }
        },
      },

      async deploy() {
        const result = await vyftExec("deploy");
        if (result.code !== 0) {
          throw new Error(`deploy failed: ${result.stderr}`);
        }
      },

      async destroy() {
        const result = await vyftExec("destroy --yes");
        if (result.code !== 0) {
          throw new Error(`destroy failed: ${result.stderr}`);
        }
      },

      async preview() {
        const result = await vyftExec("preview --json");
        if (result.code !== 0) {
          throw new Error(`preview failed: ${result.stderr}`);
        }
        return JSON.parse(result.stdout) as Change[];
      },

      async output(id?: string) {
        const cmd = id ? `output ${id} --json` : "output --json";
        const result = await vyftExec(cmd);
        if (result.code !== 0) {
          throw new Error(`output failed: ${result.stderr}`);
        }
        const parsed = JSON.parse(result.stdout);
        // When a specific resource ID is requested, return just that resource's outputs
        return id && parsed[id] ? parsed[id] : parsed;
      },

      config: {
        async set(key: string, value: string, opts?: { secret?: boolean }) {
          const secretFlag = opts?.secret ? " --secret" : "";
          const result = await vyftExec(
            `config set ${key} ${value}${secretFlag}`,
          );
          if (result.code !== 0) {
            throw new Error(`config set failed: ${result.stderr}`);
          }
        },

        async get(key: string) {
          const result = await vyftExec(`config get ${key} -o json`);
          if (result.code !== 0) {
            return undefined;
          }
          const data = JSON.parse(result.stdout);
          return data.value;
        },

        async rm(key: string) {
          const result = await vyftExec(`config rm ${key}`);
          if (result.code !== 0) {
            throw new Error(`config rm failed: ${result.stderr}`);
          }
        },

        async ls() {
          const result = await vyftExec("config ls -o json");
          if (result.code !== 0) {
            throw new Error(`config ls failed: ${result.stderr}`);
          }
          return JSON.parse(result.stdout) as ConfigListResult;
        },
      },
    },

    async exec(command: string) {
      return execCmd(command, { cwd: tmpDir, env });
    },
  };

  const cleanup = async () => {
    // Destroy resources
    try {
      await ctx.vyft.destroy();
    } catch {
      // Ignore destroy errors during cleanup
    }

    // Delete created contexts
    for (const name of createdContexts) {
      try {
        await vyftExec(`context rm ${name}`);
      } catch {
        // Ignore cleanup errors
      }
    }

    // Remove temp directory
    await rm(tmpDir, { recursive: true, force: true });
  };

  return { ctx, cleanup };
}
