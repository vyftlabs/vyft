import type { Config, Service } from "@vyft/core";
import {
  CliError,
  findConfig,
  generateSecret,
  isSecretConfig,
  loadConfig,
  projectInfo,
  resolveStage,
} from "@vyft/core";
import { buildGraph, collect, deploy as engineDeploy } from "@vyft/engine";
import type { EncryptedPayload, PersistedState } from "@vyft/store";
import {
  createFileStore,
  createStageStore,
  decrypt,
  encrypt,
  resolvePassphrase,
} from "@vyft/store";
import type { Command } from "commander";
import { createRuntime } from "../../runtime-factory.ts";

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
    .description("Manage secrets (deprecated: use `vyft config` instead)")
    .argument("<action>", "Action to perform (set|get|rm|ls|rotate)")
    .argument("[args...]", "Action arguments")
    .action(async (action: string, args: string[]) => {
      console.warn(
        'Warning: "vyft secret" is deprecated. Use "vyft config" instead.',
      );

      const { root, context, project, runtimeName } = await projectInfo();
      const stage = await resolveStage(root);
      const store = createFileStore(root);
      const stageStore = createStageStore(root);
      const passphrase = await resolvePassphrase();

      switch (action) {
        case "set": {
          const name = args[0];
          const value = args[1];
          if (!name || !value) {
            throw new CliError("Usage: vyft secret set <name> <value>");
          }

          // Store in stage storage as a secret
          const data = (await stageStore.loadStage(stage)) ?? {
            version: 1,
            values: {},
            secrets: null,
          };
          const secrets = decryptSecrets(data.secrets, passphrase);
          secrets[name] = value;
          await stageStore.saveStage(stage, {
            ...data,
            secrets: encryptSecrets(secrets, passphrase),
          });

          // Also store in state for backward compat
          const unlock = await store.lock(context, project, stage);
          try {
            const state = await store.load(context, project, stage);
            const stateSecrets = decryptSecrets(
              state?.secrets ?? null,
              passphrase,
            );
            stateSecrets[name] = value;

            const updated: PersistedState = {
              version: state?.version ?? 1,
              manifest: { timestamp: new Date().toISOString(), tool: "vyft" },
              resources: state?.resources ?? [],
              secrets: encryptSecrets(stateSecrets, passphrase),
            };
            await store.save(context, project, stage, updated);
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

          // Check stage storage first
          const data = await stageStore.loadStage(stage);
          if (data?.secrets) {
            const secrets = decryptSecrets(data.secrets, passphrase);
            if (name in secrets) {
              console.log(secrets[name]);
              break;
            }
          }

          // Fallback to state
          const state = await store.load(context, project, stage);
          const stateSecrets = decryptSecrets(
            state?.secrets ?? null,
            passphrase,
          );
          if (!(name in stateSecrets)) {
            throw new CliError(`Secret "${name}" not found.`);
          }
          console.log(stateSecrets[name]);
          break;
        }

        case "rm": {
          const name = args[0];
          if (!name) {
            throw new CliError("Usage: vyft secret rm <name>");
          }

          // Remove from stage storage
          const data = await stageStore.loadStage(stage);
          if (data?.secrets) {
            const secrets = decryptSecrets(data.secrets, passphrase);
            if (name in secrets) {
              delete secrets[name];
              await stageStore.saveStage(stage, {
                ...data,
                secrets: encryptSecrets(secrets, passphrase),
              });
            }
          }

          // Remove from state
          const unlock = await store.lock(context, project, stage);
          try {
            const state = await store.load(context, project, stage);
            const stateSecrets = decryptSecrets(
              state?.secrets ?? null,
              passphrase,
            );
            if (!(name in stateSecrets)) {
              throw new CliError(`Secret "${name}" not found.`);
            }
            delete stateSecrets[name];

            const updated: PersistedState = {
              version: state?.version ?? 1,
              manifest: { timestamp: new Date().toISOString(), tool: "vyft" },
              resources: state?.resources ?? [],
              secrets: encryptSecrets(stateSecrets, passphrase),
            };
            await store.save(context, project, stage, updated);
          } finally {
            await unlock();
          }
          console.log(`Secret "${name}" removed.`);
          break;
        }

        case "ls": {
          // Check stage storage
          const data = await stageStore.loadStage(stage);
          const stageSecrets = data?.secrets
            ? decryptSecrets(data.secrets, passphrase)
            : {};

          // Check state
          const state = await store.load(context, project, stage);
          const stateSecrets = decryptSecrets(
            state?.secrets ?? null,
            passphrase,
          );

          const allNames = [
            ...new Set([
              ...Object.keys(stageSecrets),
              ...Object.keys(stateSecrets),
            ]),
          ].sort();

          if (allNames.length === 0) {
            console.log("No secrets.");
          } else {
            for (const name of allNames) console.log(name);
          }
          break;
        }

        case "rotate": {
          const name = args[0];
          if (!name) {
            throw new CliError("Usage: vyft secret rotate <name>");
          }

          const unlock = await store.lock(context, project, stage);
          try {
            // Load from stage storage
            const data = (await stageStore.loadStage(stage)) ?? {
              version: 1,
              values: {},
              secrets: null,
            };
            const secrets = decryptSecrets(data.secrets, passphrase);
            const state = await store.load(context, project, stage);
            const stateSecrets = decryptSecrets(
              state?.secrets ?? null,
              passphrase,
            );

            if (!(name in secrets) && !(name in stateSecrets)) {
              throw new CliError(`Secret "${name}" not found.`);
            }

            // Load config to find the secret's length/alphabet
            const configPath = await findConfig(process.cwd());
            const config = await loadConfig(configPath);
            const resources = collect(config);

            const cr = resources.find(
              (r): r is Config => r.kind === "config" && r.id === name,
            );
            if (
              cr &&
              isSecretConfig(cr.config) &&
              cr.config.generated !== false
            ) {
              secrets[name] = generateSecret(
                cr.config.length,
                cr.config.alphabet,
              );
            } else {
              secrets[name] = generateSecret();
            }

            // Save to stage storage
            await stageStore.saveStage(stage, {
              ...data,
              secrets: encryptSecrets(secrets, passphrase),
            });

            // Save to state
            stateSecrets[name] = secrets[name];
            if (!state) {
              throw new CliError("No state found — nothing to rotate.");
            }
            const updated: PersistedState = {
              ...state,
              manifest: { timestamp: new Date().toISOString(), tool: "vyft" },
              secrets: encryptSecrets(stateSecrets, passphrase),
            };
            await store.save(context, project, stage, updated);

            // Redeploy dependent services
            const graph = buildGraph(resources);
            const taintedIds = new Set<string>();
            for (const [id, deps] of graph.dependencies) {
              if (deps.has(name)) taintedIds.add(id);
            }

            if (taintedIds.size > 0) {
              const secretMap = new Map(Object.entries(stateSecrets));
              // Also include stage plain values
              if (data.values) {
                for (const [k, v] of Object.entries(data.values)) {
                  if (!secretMap.has(k)) secretMap.set(k, v);
                }
              }
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

              await store.save(context, project, stage, {
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
