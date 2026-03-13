import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { confirm, isCancel, log, password } from "@clack/prompts";
import { Cipher, type Context, generateSalt, type Provider } from "@vyft/core";
import type { State } from "@vyft/engine";
import { LocalBackend, Store } from "@vyft/store";
import { platforms, runtimes } from "./providers.ts";

const VYFT_HOME = path.join(os.homedir(), ".vyft");

export interface CommandOpts {
  stage?: string;
  project?: string;
}

export function resolveStateDir(
  _cwd: string,
  context: string,
  project: string,
  stage = "production",
): string {
  return path.join(VYFT_HOME, "context", context, "project", project, "stage", stage);
}

export function resolveRuntimeStateDir(context: string): string {
  return path.join(VYFT_HOME, "context", context, "runtime");
}

export function resolveLocalStateDir(_cwd: string, project: string): string {
  return path.join(VYFT_HOME, "local", project);
}

function passphraseConfigPath(project: string): string {
  return path.join(VYFT_HOME, "config", project, "passphrase");
}

async function readPersistedPassphrase(
  project: string,
): Promise<string | null> {
  try {
    const data = await fs.readFile(passphraseConfigPath(project), "utf8");
    // trim() strips trailing newlines from manually-edited files; whitespace-only content is treated as absent
    return data.trim() || null;
  } catch {
    return null;
  }
}

async function persistPassphrase(
  project: string,
  passphrase: string,
): Promise<void> {
  const filePath = passphraseConfigPath(project);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, passphrase, { mode: 0o600 });
}

export async function resolvePassphrase(
  project: string,
  mode: "local" | "deploy" | "read",
): Promise<string> {
  const env = process.env["VYFT_PASSPHRASE"];
  if (env) return env;

  const persisted = await readPersistedPassphrase(project);
  if (persisted) return persisted;

  if (mode === "local") {
    const generated = crypto.randomBytes(32).toString("hex");
    await persistPassphrase(project, generated);
    log.info(`Generated passphrase saved to ${passphraseConfigPath(project)}`);
    return generated;
  }

  const value = await password({ message: "Enter passphrase:" });
  if (isCancel(value)) process.exit(1);

  if (mode === "deploy") {
    const save = await confirm({
      message: "Save passphrase locally for future use?",
    });
    // Cancelling the save prompt is treated as "no" — passphrase is returned without saving
    if (!isCancel(save) && save) {
      await persistPassphrase(project, value);
      log.info(`Passphrase saved to ${passphraseConfigPath(project)}`);
    }
  }

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

export function resolveRuntimeProvider(
  runtime: string,
  project: string,
  stage: string,
): Provider<unknown> {
  const factory = runtimes.get(runtime);
  if (!factory) {
    const supported = [...runtimes.keys()].join(", ");
    throw new Error(`Unknown runtime: "${runtime}". Supported: ${supported}`);
  }
  return factory({ project, stage });
}

export function resolvePlatformProvider(
  platform: string,
  project: string,
  stage: string,
): Provider<unknown> {
  const factory = platforms.get(platform);
  if (!factory) {
    const supported = [...platforms.keys()].join(", ");
    throw new Error(`Unknown platform: "${platform}". Supported: ${supported}`);
  }
  return factory({ project, stage });
}
