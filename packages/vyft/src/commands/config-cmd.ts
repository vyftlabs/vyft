import { join } from "node:path";
import type { ResourceState, URN } from "@vyft/core";
import {
  buildURN,
  CliError,
  parseURN,
  projectInfo,
  resolveStage,
} from "@vyft/core";
import type { EncryptedPayload } from "@vyft/store";
import { decrypt, encrypt, resolvePassphrase, Store } from "@vyft/store";
import type { Command } from "commander";
import { createPrinter, type OutputFormat } from "../printer.ts";

function variableURN(name: string): URN {
  return buildURN("platform", "default", "variable", name);
}

function findVariable(
  state: Map<URN, ResourceState>,
  name: string,
): ResourceState | undefined {
  const urn = variableURN(name);
  return state.get(urn);
}

function isEncrypted(rs: ResourceState): boolean {
  return rs.sensitive?.includes("value") === true;
}

function makeVariableState(
  name: string,
  value: string,
  secret: boolean,
  passphrase: string,
  existing?: ResourceState,
): ResourceState {
  const now = new Date().toISOString();
  const outputs: Record<string, unknown> = secret
    ? { value: encrypt(value, passphrase) }
    : { value };
  return {
    urn: variableURN(name),
    fingerprint: JSON.stringify(outputs),
    inputs: {},
    outputs,
    dependencies: [],
    created: existing?.created ?? now,
    modified: now,
    taint: false,
    ...(secret ? { sensitive: ["value"] } : {}),
  };
}

export function registerVariable(program: Command): void {
  program
    .command("variable")
    .description("Manage variable values")
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
        const { root, context, project } = await projectInfo();
        const stage = opts.stage ?? (await resolveStage(root));
        const dir = join(root, context, project, stage);

        switch (action) {
          case "set": {
            const name = args[0];
            const value = args[1];
            if (!name || value === undefined) {
              throw new CliError(
                "Usage: vyft variable set <name> <value> [--stage <stage>] [--secret]",
              );
            }

            const passphrase = await resolvePassphrase();
            const store = await Store.open(dir);
            try {
              const existing = findVariable(store.state, name);
              const rs = makeVariableState(
                name,
                value,
                !!opts.secret,
                passphrase,
                existing,
              );

              store.state.set(rs.urn, rs);
              await store.checkpoint();
            } finally {
              await store.dispose();
            }

            print.message(`Variable "${name}" saved to stage "${stage}".`, {
              name,
              stage,
            });
            break;
          }

          case "get": {
            const name = args[0];
            if (!name) {
              throw new CliError(
                "Usage: vyft variable get <name> [--stage <stage>]",
              );
            }

            const store = await Store.open(dir);
            try {
              const rs = findVariable(store.state, name);
              if (!rs) {
                throw new CliError(
                  `Variable "${name}" not found in stage "${stage}".`,
                );
              }

              let value: string;
              if (isEncrypted(rs)) {
                const passphrase = await resolvePassphrase();
                value = decrypt(
                  rs.outputs["value"] as EncryptedPayload,
                  passphrase,
                );
              } else {
                value = rs.outputs["value"] as string;
              }

              print.message(value, {
                name,
                value,
                secret: isEncrypted(rs),
              });
            } finally {
              await store.dispose();
            }
            break;
          }

          case "rm": {
            const name = args[0];
            if (!name) {
              throw new CliError(
                "Usage: vyft variable rm <name> [--stage <stage>]",
              );
            }

            const store = await Store.open(dir);
            try {
              const urn = variableURN(name);
              if (!store.state.has(urn)) {
                throw new CliError(
                  `Variable "${name}" not found in stage "${stage}".`,
                );
              }

              store.state.delete(urn);
              await store.checkpoint();
            } finally {
              await store.dispose();
            }

            print.message(`Variable "${name}" removed from stage "${stage}".`, {
              name,
              stage,
            });
            break;
          }

          case "ls": {
            const store = await Store.open(dir);
            try {
              const variables = [...store.state.values()].filter((r) => {
                try {
                  return parseURN(r.urn).resource === "variable";
                } catch {
                  return false;
                }
              });

              const items = variables
                .map((r) => ({
                  name: parseURN(r.urn).id,
                  secret: isEncrypted(r),
                }))
                .sort((a, b) => a.name.localeCompare(b.name));

              if (opts.output === "json") {
                print.object({ stage, items });
              } else {
                if (items.length === 0) {
                  console.log(`No variable values in stage "${stage}".`);
                } else {
                  for (const item of items) {
                    if (item.secret) {
                      console.log(`${item.name} [secret]`);
                    } else {
                      console.log(item.name);
                    }
                  }
                }
              }
            } finally {
              await store.dispose();
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
