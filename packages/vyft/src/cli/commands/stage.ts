import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { CliError, resolveStage, vyftRoot } from "@vyft/core";
import { createStageStore, decrypt, resolvePassphrase } from "@vyft/store";
import type { Command } from "commander";

async function readActiveStage(root: string): Promise<string> {
  return resolveStage(root);
}

async function writeActiveStage(root: string, name: string): Promise<void> {
  const dir = join(root, "stages");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "active"), `${name}\n`, "utf8");
}

const ACTIONS = ["create", "use", "ls", "rm", "show"] as const;

export function registerStage(program: Command): void {
  program
    .command("stage")
    .description("Manage deployment stages")
    .argument("<action>", `Action to perform (${ACTIONS.join("|")})`)
    .argument("[name]", "Stage name")
    .action(async (action: string, name: string | undefined) => {
      if (!ACTIONS.includes(action as (typeof ACTIONS)[number])) {
        throw new CliError(
          `Unknown action: ${action}. Expected one of: ${ACTIONS.join(", ")}`,
        );
      }

      const root = vyftRoot(basename(process.cwd()));
      const stageStore = createStageStore(root);

      switch (action) {
        case "create": {
          if (!name) throw new CliError(`"vyft stage create" requires a name`);
          const existing = await stageStore.loadStage(name);
          if (existing) {
            throw new CliError(`Stage "${name}" already exists.`);
          }

          await stageStore.saveStage(name, {
            version: 1,
            values: {},
            secrets: null,
          });
          await writeActiveStage(root, name);
          console.log(`Stage "${name}" created and set as active.`);
          break;
        }

        case "use": {
          if (!name) throw new CliError(`"vyft stage use" requires a name`);
          // "local" always exists implicitly
          if (name !== "local") {
            const existing = await stageStore.loadStage(name);
            if (!existing) {
              throw new CliError(
                `Stage "${name}" does not exist. Run \`vyft stage create ${name}\` first.`,
              );
            }
          }
          await writeActiveStage(root, name);
          console.log(`Switched to stage "${name}".`);
          break;
        }

        case "rm": {
          if (!name) throw new CliError(`"vyft stage rm" requires a name`);
          if (name === "local") {
            throw new CliError(`Cannot remove the "local" stage.`);
          }
          const existing = await stageStore.loadStage(name);
          if (!existing) {
            throw new CliError(`Stage "${name}" does not exist.`);
          }

          await stageStore.deleteStage(name);

          const active = await readActiveStage(root);
          if (active === name) {
            await writeActiveStage(root, "local");
          }

          console.log(`Stage "${name}" removed.`);
          break;
        }

        case "show": {
          if (!name) throw new CliError(`"vyft stage show" requires a name`);
          const data = await stageStore.loadStage(name);
          const active = await readActiveStage(root);

          if (!data && name !== "local") {
            throw new CliError(`Stage "${name}" does not exist.`);
          }

          console.log(`Stage: ${name}${active === name ? " (active)" : ""}`);

          const values = data?.values ?? {};
          const valueNames = Object.keys(values).sort();

          // Determine secret names
          const secretNames = new Set<string>();
          if (data?.secrets) {
            try {
              const passphrase = await resolvePassphrase();
              const raw = JSON.parse(
                decrypt(data.secrets, passphrase),
              ) as Record<string, string>;
              for (const k of Object.keys(raw)) secretNames.add(k);
            } catch {
              // If passphrase not available, we can't list secret names
            }
          }

          const allNames = [...new Set([...valueNames, ...secretNames])].sort();

          if (allNames.length === 0) {
            console.log("  No config values.");
          } else {
            console.log("  Values:");
            for (const n of allNames) {
              if (secretNames.has(n)) {
                console.log(`    ${n} [secret]`);
              } else {
                console.log(`    ${n}`);
              }
            }
          }
          break;
        }

        case "ls": {
          const active = await readActiveStage(root);
          const stages = await stageStore.listStages();

          // Always include "local"
          const allStages = new Set(stages);
          allStages.add("local");
          const sorted = [...allStages].sort();

          for (const s of sorted) {
            const marker = s === active ? " *" : "";
            console.log(`${s}${marker}`);
          }
          break;
        }
      }
    });
}
