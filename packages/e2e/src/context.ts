import { randomUUID } from "node:crypto";
import {
  access,
  readFile as fsReadFile,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
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

export interface ContextShowResult {
  name: string;
  runtime: string;
  hasPassphrase: boolean;
  projects: Array<{ name: string; resources: number }>;
}

export interface StageShowResult {
  name: string;
  values: Array<{ name: string; secret: boolean; value?: string }>;
}

export interface DiffResult {
  hasDrift: boolean;
  resources: Array<{
    id: string;
    status: "missing" | "drifted" | "extra";
    details?: Record<string, unknown>;
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

export interface TestContext {
  /** Unique ID for this test run - use for parallel isolation */
  id: string;

  vyft: {
    context: {
      create: (name: string, opts?: { runtime?: string }) => Promise<void>;
      use: (name: string) => Promise<void>;
      ls: () => Promise<ListResult>;
      rm: (name: string) => Promise<void>;
      show: (name: string) => Promise<ContextShowResult>;
    };
    stage: {
      create: (name: string) => Promise<void>;
      use: (name: string) => Promise<void>;
      ls: () => Promise<ListResult>;
      rm: (name: string) => Promise<void>;
      show: (name: string) => Promise<StageShowResult>;
    };
    deploy: (opts?: { verbose?: boolean; refresh?: boolean }) => Promise<void>;
    destroy: (opts?: { verbose?: boolean }) => Promise<void>;
    preview: (opts?: { verbose?: boolean }) => Promise<Change[]>;
    refresh: (opts?: { clearPending?: boolean }) => Promise<void>;
    diff: () => Promise<DiffResult>;
    output: (
      id?: string,
      opts?: { showSecrets?: boolean },
    ) => Promise<OutputResult | Record<string, unknown>>;
    config: {
      set: (
        key: string,
        value: string,
        opts?: { secret?: boolean; stage?: string },
      ) => Promise<void>;
      get: (
        key: string,
        opts?: { stage?: string },
      ) => Promise<string | undefined>;
      rm: (key: string, opts?: { stage?: string }) => Promise<void>;
      ls: (opts?: { stage?: string }) => Promise<ConfigListResult>;
      rotate: (key: string, opts?: { stage?: string }) => Promise<void>;
    };
    /** Run raw vyft command and return result */
    raw: (args: string) => Promise<ExecResult>;
  };
  exec: (command: string) => Promise<ExecResult>;
  /** Write a custom config file */
  writeConfig: (content: string) => Promise<void>;
  /** Write any file in the test directory */
  writeFile: (path: string, content: string) => Promise<void>;
  /** Read any file in the test directory */
  readFile: (path: string) => Promise<string>;
  /** Check if a file exists in the test directory */
  fileExists: (path: string) => Promise<boolean>;
  /** Get the temp directory path */
  tmpDir: string;
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
    tmpDir,

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

        async show(name: string) {
          const result = await vyftExec(`context show ${name} -o json`);
          if (result.code !== 0) {
            throw new Error(`context show failed: ${result.stderr}`);
          }
          return JSON.parse(result.stdout) as ContextShowResult;
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

        async show(name: string) {
          const result = await vyftExec(`stage show ${name} -o json`);
          if (result.code !== 0) {
            throw new Error(`stage show failed: ${result.stderr}`);
          }
          return JSON.parse(result.stdout) as StageShowResult;
        },
      },

      async deploy(opts?: { verbose?: boolean; refresh?: boolean }) {
        const flags: string[] = [];
        if (opts?.verbose) flags.push("--verbose");
        if (opts?.refresh) flags.push("--refresh");
        const result = await vyftExec(`deploy ${flags.join(" ")}`);
        if (result.code !== 0) {
          throw new Error(`deploy failed: ${result.stderr}`);
        }
      },

      async destroy(opts?: { verbose?: boolean }) {
        const flags = opts?.verbose ? "--verbose " : "";
        const result = await vyftExec(`destroy --yes ${flags}`);
        if (result.code !== 0) {
          throw new Error(`destroy failed: ${result.stderr}`);
        }
      },

      async preview(opts?: { verbose?: boolean }) {
        const flags: string[] = ["-o json"];
        if (opts?.verbose) flags.push("--verbose");
        const result = await vyftExec(`preview ${flags.join(" ")}`);
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

      async refresh(opts?: { clearPending?: boolean }) {
        const flags = opts?.clearPending ? "--clear-pending " : "";
        const result = await vyftExec(`refresh ${flags}`);
        if (result.code !== 0) {
          throw new Error(`refresh failed: ${result.stderr}`);
        }
      },

      async diff() {
        const result = await vyftExec("diff --json");
        // diff returns exit code 1 if drift detected, which is not an error
        if (result.code !== 0 && result.code !== 1) {
          throw new Error(`diff failed: ${result.stderr}`);
        }
        try {
          return JSON.parse(result.stdout) as DiffResult;
        } catch {
          // If no JSON output, return empty result
          return { hasDrift: result.code === 1, resources: [] };
        }
      },

      async output(id?: string, opts?: { showSecrets?: boolean }) {
        const secretsFlag = opts?.showSecrets ? " --show-secrets" : "";
        const cmd = id
          ? `output ${id} --json${secretsFlag}`
          : `output --json${secretsFlag}`;
        const result = await vyftExec(cmd);
        if (result.code !== 0) {
          throw new Error(`output failed: ${result.stderr}`);
        }
        const parsed = JSON.parse(result.stdout);
        // When a specific resource ID is requested, return just that resource's outputs
        return id && parsed[id] ? parsed[id] : parsed;
      },

      config: {
        async set(
          key: string,
          value: string,
          opts?: { secret?: boolean; stage?: string },
        ) {
          const flags: string[] = [];
          if (opts?.secret) flags.push("--secret");
          if (opts?.stage) flags.push(`--stage ${opts.stage}`);
          // Use double quotes with proper escaping of shell metacharacters
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

        async get(key: string, opts?: { stage?: string }) {
          const stageFlag = opts?.stage ? ` --stage ${opts.stage}` : "";
          const result = await vyftExec(
            `config get ${key} -o json${stageFlag}`,
          );
          if (result.code !== 0) {
            return undefined;
          }
          const data = JSON.parse(result.stdout);
          return data.value;
        },

        async rm(key: string, opts?: { stage?: string }) {
          const stageFlag = opts?.stage ? ` --stage ${opts.stage}` : "";
          const result = await vyftExec(`config rm ${key}${stageFlag}`);
          if (result.code !== 0) {
            throw new Error(`config rm failed: ${result.stderr}`);
          }
        },

        async ls(opts?: { stage?: string }) {
          const stageFlag = opts?.stage ? ` --stage ${opts.stage}` : "";
          const result = await vyftExec(`config ls -o json${stageFlag}`);
          if (result.code !== 0) {
            throw new Error(`config ls failed: ${result.stderr}`);
          }
          return JSON.parse(result.stdout) as ConfigListResult;
        },

        async rotate(key: string, opts?: { stage?: string }) {
          const stageFlag = opts?.stage ? ` --stage ${opts.stage}` : "";
          const result = await vyftExec(`config rotate ${key}${stageFlag}`);
          if (result.code !== 0) {
            throw new Error(`config rotate failed: ${result.stderr}`);
          }
        },
      },

      async raw(args: string) {
        return vyftExec(args);
      },
    },

    async exec(command: string) {
      return execCmd(command, { cwd: tmpDir, env });
    },

    async writeConfig(content: string) {
      await writeFile(join(tmpDir, "vyft.config.ts"), content);
    },

    async writeFile(path: string, content: string) {
      await writeFile(join(tmpDir, path), content);
    },

    async readFile(path: string) {
      return fsReadFile(join(tmpDir, path), "utf-8");
    },

    async fileExists(path: string) {
      try {
        await access(join(tmpDir, path));
        return true;
      } catch {
        return false;
      }
    },
  };

  const cleanup = async () => {
    await ctx.vyft.destroy();

    for (const name of createdContexts) {
      try {
        await ctx.vyft.context.rm(name);
      } catch {
        // Context may have been removed by the test
      }
    }

    await rm(tmpDir, { recursive: true, force: true });
  };

  return { ctx, cleanup };
}
