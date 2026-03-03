import { basename } from "node:path";
import { CliError, resolveStage, vyftRoot } from "@vyft/core";
import type { EncryptedPayload } from "@vyft/store";
import {
  createStageStore,
  decrypt,
  encrypt,
  resolvePassphrase,
} from "@vyft/store";
import type { Command } from "commander";
import { createPrinter, type OutputFormat } from "../printer.ts";

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
    .argument("<action>", "Action to perform (set|get|rm|ls)")
    .argument("[args...]", "Action arguments")
    .option("--stage <stage>", "Stage to operate on (default: active stage)")
    .option("--secret", "Encrypt the value as a secret", false)
    .option("-o, --output <format>", "Output format (text|json)", "text")
    .action(
      async (
        action: string,
        args: string[],
        opts: { stage?: string; secret?: boolean; output: OutputFormat },
      ) => {
        const print = createPrinter({ format: opts.output });
        const root = vyftRoot(basename(process.cwd()));
        const stageStore = createStageStore(root);
        const stage = opts.stage ?? (await resolveStage(root));

        switch (action) {
          case "set": {
            const name = args[0];
            const value = args[1];
            if (!name || value === undefined) {
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
            print.message(`Config "${name}" saved to stage "${stage}".`, {
              name,
              stage,
            });
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
            const plainValue = data.values[name];
            if (plainValue !== undefined) {
              print.message(plainValue, { name, value: plainValue });
              break;
            }

            // Check secrets
            if (data.secrets) {
              const passphrase = await resolvePassphrase();
              const secrets = decryptSecrets(data.secrets, passphrase);
              const secretValue = secrets[name];
              if (secretValue !== undefined) {
                print.message(secretValue, {
                  name,
                  value: secretValue,
                  secret: true,
                });
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
            print.message(`Config "${name}" removed from stage "${stage}".`, {
              name,
              stage,
            });
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

            if (opts.output === "json") {
              const items = allNames.map((name) => ({
                name,
                secret: secretNames.includes(name),
              }));
              print.object({ stage, items });
            } else {
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
            }
            break;
          }

          default:
            throw new CliError(
              `Unknown action "${action}". Use: set, get, rm, ls`,
            );
        }
      },
    );
}
