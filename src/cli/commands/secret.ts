import type { Command } from "commander";
import { findConfig, loadConfig, projectInfo } from "../../config.ts";
import {
  buildGraph,
  collect,
  deploy as engineDeploy,
} from "../../engine/index.ts";
import { CliError } from "../../errors.ts";
import { generateSecret } from "../../generate.ts";
import type { Secret, Service } from "../../resource.ts";
import { createRuntime } from "../../runtimes/index.ts";
import { decrypt, encrypt } from "../../store/encrypt.ts";
import { createFileStore } from "../../store/file.ts";
import { resolvePassphrase } from "../../store/passphrase.ts";
import type { EncryptedPayload, PersistedState } from "../../store/types.ts";

type SecretMap = Record<string, string>;

function decryptSecrets(
  payload: EncryptedPayload | null,
  passphrase: string,
): SecretMap {
  if (!payload) return {};
  return JSON.parse(decrypt(payload, passphrase)) as SecretMap;
}

function encryptSecrets(
  secrets: SecretMap,
  passphrase: string,
): EncryptedPayload | null {
  const keys = Object.keys(secrets);
  if (keys.length === 0) return null;
  return encrypt(JSON.stringify(secrets), passphrase);
}

export function registerSecret(program: Command): void {
  program
    .command("secret")
    .description("Manage secrets")
    .argument("<action>", "Action to perform (set|get|rm|ls|rotate)")
    .argument("[args...]", "Action arguments")
    .action(async (action: string, args: string[]) => {
      const { root, context, project, runtimeName } = await projectInfo();
      const store = createFileStore(root);
      const passphrase = await resolvePassphrase();

      switch (action) {
        case "set": {
          const name = args[0];
          const value = args[1];
          if (!name || !value) {
            throw new CliError("Usage: vyft secret set <name> <value>");
          }

          const unlock = await store.lock(context, project);
          try {
            const state = await store.load(context, project);
            const secrets = decryptSecrets(state?.secrets ?? null, passphrase);
            secrets[name] = value;

            const updated: PersistedState = {
              version: state?.version ?? 1,
              manifest: { timestamp: new Date().toISOString(), tool: "vyft" },
              resources: state?.resources ?? [],
              secrets: encryptSecrets(secrets, passphrase),
            };
            await store.save(context, project, updated);
          } finally {
            await unlock();
          }
          console.log(`Secret "${name}" saved.`);
          break;
        }

        case "get": {
          const name = args[0];
          if (!name) {
            throw new CliError("Usage: vyft secret get <name>");
          }
          const state = await store.load(context, project);
          const secrets = decryptSecrets(state?.secrets ?? null, passphrase);
          if (!(name in secrets)) {
            throw new CliError(`Secret "${name}" not found.`);
          }
          console.log(secrets[name]);
          break;
        }

        case "rm": {
          const name = args[0];
          if (!name) {
            throw new CliError("Usage: vyft secret rm <name>");
          }

          const unlock = await store.lock(context, project);
          try {
            const state = await store.load(context, project);
            const secrets = decryptSecrets(state?.secrets ?? null, passphrase);
            if (!(name in secrets)) {
              throw new CliError(`Secret "${name}" not found.`);
            }
            delete secrets[name];

            const updated: PersistedState = {
              version: state?.version ?? 1,
              manifest: { timestamp: new Date().toISOString(), tool: "vyft" },
              resources: state?.resources ?? [],
              secrets: encryptSecrets(secrets, passphrase),
            };
            await store.save(context, project, updated);
          } finally {
            await unlock();
          }
          console.log(`Secret "${name}" removed.`);
          break;
        }

        case "ls": {
          const state = await store.load(context, project);
          const secrets = decryptSecrets(state?.secrets ?? null, passphrase);
          const names = Object.keys(secrets);
          if (names.length === 0) {
            console.log("No secrets.");
          } else {
            for (const name of names.sort()) console.log(name);
          }
          break;
        }

        case "rotate": {
          const name = args[0];
          if (!name) {
            throw new CliError("Usage: vyft secret rotate <name>");
          }

          const unlock = await store.lock(context, project);
          try {
            const state = await store.load(context, project);
            const secrets = decryptSecrets(state?.secrets ?? null, passphrase);
            if (!(name in secrets)) {
              throw new CliError(`Secret "${name}" not found.`);
            }

            // Load config to find the secret's length/alphabet
            const configPath = await findConfig(process.cwd());
            const config = await loadConfig(configPath);
            const resources = collect(config);

            const sr = resources.find(
              (r): r is Secret => r.kind === "secret" && r.id === name,
            );
            if (sr && sr.config.generated !== false) {
              secrets[name] = generateSecret(
                sr.config.length,
                sr.config.alphabet,
              );
            } else {
              secrets[name] = generateSecret();
            }

            // Save new secret value immediately
            if (!state) {
              throw new CliError("No state found — nothing to rotate.");
            }
            const updated: PersistedState = {
              ...state,
              manifest: { timestamp: new Date().toISOString(), tool: "vyft" },
              secrets: encryptSecrets(secrets, passphrase),
            };
            await store.save(context, project, updated);

            // Redeploy dependent services
            const graph = buildGraph(resources);
            const taintedIds = new Set<string>();
            for (const [id, deps] of graph.dependencies) {
              if (deps.has(name)) taintedIds.add(id);
            }

            if (taintedIds.size > 0) {
              const secretMap = new Map(Object.entries(secrets));
              const runtime = createRuntime(runtimeName, {
                project,
                secrets: secretMap,
              });
              const previousResources = state?.resources ?? [];
              const result = await engineDeploy(
                resources,
                previousResources,
                runtime,
                undefined,
                taintedIds,
              );

              const services = resources.filter(
                (r): r is Service => r.kind === "service",
              );
              await runtime.finalize(services);

              const runtimeStateMap = runtime.runtimeState();
              const finalResources = result.state.map((rs) => {
                const extra = runtimeStateMap.get(rs.id);
                return extra
                  ? { ...rs, runtime: { ...rs.runtime, ...extra } }
                  : rs;
              });

              await store.save(context, project, {
                ...updated,
                resources: finalResources,
              });
            }
          } finally {
            await unlock();
          }
          console.log(`Secret "${name}" rotated.`);
          break;
        }

        default:
          throw new CliError(
            `Unknown action "${action}". Use: set, get, rm, ls, rotate`,
          );
      }
    });
}
