import type { Config } from "@vyft/core";
import {
  CliError,
  findConfig,
  generateSecret,
  isSecretConfig,
  loadConfig,
  resolveStage,
} from "@vyft/core";
import { collect } from "@vyft/engine";
import type { EncryptedPayload } from "@vyft/store";
import {
  createStageStore,
  decrypt,
  encrypt,
  resolvePassphrase,
} from "@vyft/store";
import type { Command } from "commander";

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

export function registerConfig(program: Command): void {
  program
    .command("config")
    .description("Manage config values")
    .argument("<action>", "Action to perform (set|get|rm|ls|rotate)")
    .argument("[args...]", "Action arguments")
    .option("--stage <stage>", "Stage to operate on (default: active stage)")
    .option("--secret", "Encrypt the value as a secret", false)
    .action(
      async (
        action: string,
        args: string[],
        opts: { stage?: string; secret?: boolean },
      ) => {
        const { join } = await import("node:path");
        const root = join(process.cwd(), ".vyft");
        const stageStore = createStageStore(root);
        const stage = opts.stage ?? (await resolveStage(root));

        switch (action) {
          case "set": {
            const name = args[0];
            const value = args[1];
            if (!name || !value) {
              throw new CliError(
                "Usage: vyft config set <name> <value> [--stage <stage>] [--secret]",
              );
            }

            const data = (await stageStore.loadStage(stage)) ?? {
              version: 1,
              values: {},
              secrets: null,
            };

            if (opts.secret) {
              const passphrase = await resolvePassphrase();
              const secrets = decryptSecrets(data.secrets, passphrase);
              secrets[name] = value;
              // Remove from plain values if it was there
              const { [name]: _, ...remainingValues } = data.values;
              await stageStore.saveStage(stage, {
                ...data,
                values: remainingValues,
                secrets: encryptSecrets(secrets, passphrase),
              });
            } else {
              // Remove from secrets if it was there
              let updatedSecrets = data.secrets;
              if (data.secrets) {
                const passphrase = await resolvePassphrase();
                const secrets = decryptSecrets(data.secrets, passphrase);
                if (name in secrets) {
                  delete secrets[name];
                  updatedSecrets = encryptSecrets(secrets, passphrase);
                }
              }
              await stageStore.saveStage(stage, {
                ...data,
                values: { ...data.values, [name]: value },
                secrets: updatedSecrets,
              });
            }
            console.log(`Config "${name}" saved to stage "${stage}".`);
            break;
          }

          case "get": {
            const name = args[0];
            if (!name) {
              throw new CliError(
                "Usage: vyft config get <name> [--stage <stage>]",
              );
            }
            const data = await stageStore.loadStage(stage);
            if (!data) {
              throw new CliError(`Stage "${stage}" does not exist.`);
            }

            // Check plain values first
            if (name in data.values) {
              console.log(data.values[name]);
              break;
            }

            // Check secrets
            if (data.secrets) {
              const passphrase = await resolvePassphrase();
              const secrets = decryptSecrets(data.secrets, passphrase);
              if (name in secrets) {
                console.log(secrets[name]);
                break;
              }
            }

            throw new CliError(
              `Config "${name}" not found in stage "${stage}".`,
            );
          }

          case "rm": {
            const name = args[0];
            if (!name) {
              throw new CliError(
                "Usage: vyft config rm <name> [--stage <stage>]",
              );
            }
            const data = await stageStore.loadStage(stage);
            if (!data) {
              throw new CliError(`Stage "${stage}" does not exist.`);
            }

            let found = false;

            // Remove from plain values
            if (name in data.values) {
              const { [name]: _, ...remaining } = data.values;
              await stageStore.saveStage(stage, {
                ...data,
                values: remaining,
              });
              found = true;
            }

            // Remove from secrets
            if (data.secrets) {
              const passphrase = await resolvePassphrase();
              const secrets = decryptSecrets(data.secrets, passphrase);
              if (name in secrets) {
                delete secrets[name];
                const reloaded = found
                  ? await stageStore.loadStage(stage)
                  : null;
                const updatedData = reloaded ?? data;
                await stageStore.saveStage(stage, {
                  ...updatedData,
                  ...(found ? {} : { values: data.values }),
                  secrets: encryptSecrets(secrets, passphrase),
                });
                found = true;
              }
            }

            if (!found) {
              throw new CliError(
                `Config "${name}" not found in stage "${stage}".`,
              );
            }
            console.log(`Config "${name}" removed from stage "${stage}".`);
            break;
          }

          case "ls": {
            const data = await stageStore.loadStage(stage);

            const valueNames = Object.keys(data?.values ?? {});
            const secretNames: string[] = [];

            if (data?.secrets) {
              try {
                const passphrase = await resolvePassphrase();
                const secrets = decryptSecrets(data.secrets, passphrase);
                secretNames.push(...Object.keys(secrets));
              } catch {
                // If passphrase not available, skip
              }
            }

            const allNames = [
              ...new Set([...valueNames, ...secretNames]),
            ].sort();

            if (allNames.length === 0) {
              console.log(`No config values in stage "${stage}".`);
            } else {
              for (const name of allNames) {
                if (secretNames.includes(name)) {
                  console.log(`${name} [secret]`);
                } else {
                  console.log(name);
                }
              }
            }
            break;
          }

          case "rotate": {
            const name = args[0];
            if (!name) {
              throw new CliError(
                "Usage: vyft config rotate <name> [--stage <stage>]",
              );
            }

            const data = await stageStore.loadStage(stage);
            if (!data?.secrets) {
              throw new CliError(
                `Config "${name}" not found as a secret in stage "${stage}".`,
              );
            }

            const passphrase = await resolvePassphrase();
            const secrets = decryptSecrets(data.secrets, passphrase);
            if (!(name in secrets)) {
              throw new CliError(
                `Config "${name}" not found as a secret in stage "${stage}".`,
              );
            }

            // Load config to find length/alphabet
            try {
              const configPath = await findConfig(process.cwd());
              const configMod = await loadConfig(configPath);
              const resources = collect(configMod);
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
            } catch {
              secrets[name] = generateSecret();
            }

            await stageStore.saveStage(stage, {
              ...data,
              secrets: encryptSecrets(secrets, passphrase),
            });
            console.log(`Config "${name}" rotated in stage "${stage}".`);
            break;
          }

          default:
            throw new CliError(
              `Unknown action "${action}". Use: set, get, rm, ls, rotate`,
            );
        }
      },
    );
}
