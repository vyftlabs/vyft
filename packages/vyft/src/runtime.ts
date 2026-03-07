import fs from "node:fs/promises";
import path from "node:path";
import { isCancel, password } from "@clack/prompts";
import {
  Cipher,
  type Context,
  generateSalt,
  type Provider,
  RESOURCE,
  type ResourceDefinition,
} from "@vyft/core";
import docker, {
  createDockerContext,
  postgresHandlers,
  redisHandlers,
  siteHandlers,
} from "@vyft/docker";
import type { State } from "@vyft/engine";
import local from "@vyft/local";
import { LocalBackend, Store } from "../../../store/src/index.ts";

const VYFT_DIR = ".vyft";

export interface CommandOpts {
  stage?: string;
  project?: string;
}

export function resolveStateDir(
  cwd: string,
  context: string,
  project: string,
  stage = "production",
): string {
  return path.join(cwd, VYFT_DIR, context, project, stage);
}

export async function resolvePassphrase(): Promise<string> {
  const env = process.env["VYFT_PASSPHRASE"];
  if (env) return env;

  const value = await password({ message: "Enter passphrase:" });
  if (isCancel(value)) process.exit(1);
  return value;
}

export async function loadSalt(stateDir: string): Promise<Buffer> {
  const saltPath = path.join(stateDir, "salt");
  try {
    return await fs.readFile(saltPath);
  } catch {
    const salt = generateSalt();
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(saltPath, salt);
    return salt;
  }
}

export async function openStore(stateDir: string): Promise<Store> {
  await fs.mkdir(stateDir, { recursive: true });
  return Store.open(new LocalBackend(stateDir));
}

export function buildCurrentState(store: Store): State {
  const entries: Record<string, State["entries"][string]> = {};
  for (const [key, value] of store.entries()) {
    const data = value as Record<string, unknown>;
    if (data["status"] === "committed") {
      const entry: State["entries"][string] = {
        urn: key,
        input: (data["input"] as Record<string, unknown>) ?? {},
      };
      const output = data["output"] as Record<string, unknown> | undefined;
      if (output) {
        entry.output = output;
      }
      const externalId = data["externalId"] as string | undefined;
      if (externalId) {
        entry.externalId = externalId;
      }
      entries[key] = entry;
    }
  }
  return { entries };
}

export function createArtifacts(stateDir: string): Context["createArtifacts"] {
  return (urn: string) => {
    const dir = path.join(stateDir, "artifacts", urn);
    return {
      async write(name: string, data: string | Buffer) {
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(dir, name), data);
        return { key: name };
      },
      async read(ref) {
        return fs.readFile(path.join(dir, ref.key));
      },
      async exists(ref) {
        try {
          await fs.access(path.join(dir, ref.key));
          return true;
        } catch {
          return false;
        }
      },
      async delete(ref) {
        await fs.rm(path.join(dir, ref.key), { force: true });
      },
    };
  };
}

export function createCipher(passphrase: string, salt: Buffer): Cipher {
  return new Cipher(passphrase, salt);
}

export function buildContext(
  store: Store,
  cipher: Cipher,
  providers: Record<string, Provider<unknown>>,
  stateDir: string,
): Context {
  return {
    store,
    cipher,
    providers,
    createArtifacts: createArtifacts(stateDir),
  };
}

async function importProvider(
  pkg: string,
): Promise<(opts: unknown) => Provider<unknown>> {
  try {
    const mod = await import(pkg);
    const factory = mod.default;
    if (typeof factory !== "function") {
      throw new Error(`"${pkg}" does not export a valid provider`);
    }
    return factory;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND") {
      throw new Error(
        `Provider "${pkg}" is not installed. Run: pnpm add ${pkg}`,
      );
    }
    throw err;
  }
}

export async function resolveRuntimeProvider(
  runtime: string,
  project: string,
  stage: string,
): Promise<Provider<unknown>> {
  switch (runtime) {
    case "docker":
      return docker({ project, stage });
    default: {
      const factory = await importProvider(`@vyft/${runtime}`);
      return factory({ project, stage });
    }
  }
}

const FALLBACK_RESOURCES: Record<string, ResourceDefinition> = {
  postgres: { [RESOURCE]: true, name: "postgres", handlers: postgresHandlers },
  redis: { [RESOURCE]: true, name: "redis", handlers: redisHandlers },
  site: { [RESOURCE]: true, name: "site", handlers: siteHandlers },
};

export async function resolvePlatformProvider(
  platform: string,
  project: string,
  stage: string,
): Promise<Provider<unknown>> {
  let provider: Provider<unknown>;
  switch (platform) {
    case "remote":
      provider = local({});
      break;
    default: {
      const factory = await importProvider(`@vyft/${platform}`);
      provider = factory({});
      break;
    }
  }

  const resources = provider.config.resources ?? {};
  const missing: Record<string, ResourceDefinition> = {};
  for (const [name, def] of Object.entries(FALLBACK_RESOURCES)) {
    if (!resources[name]) {
      missing[name] = def;
    }
  }

  if (Object.keys(missing).length === 0) return provider;

  const originalContext = provider.config.context;
  return {
    config: {
      ...provider.config,
      context: async () => {
        const platformCtx = await originalContext();
        const dockerCtx = createDockerContext({ project, stage });
        return Object.assign({}, platformCtx, dockerCtx);
      },
      resources: { ...resources, ...missing },
    },
  };
}
