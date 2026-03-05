import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { CliError, resolveStage, vyftRoot } from "@vyft/core";
import type { Command } from "commander";
import { createPrinter, type OutputFormat } from "../printer.ts";

async function readActiveStage(root: string): Promise<string> {
  return resolveStage(root);
}

async function writeActiveStage(root: string, name: string): Promise<void> {
  const dir = join(root, "stages");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "active"), `${name}\n`, "utf8");
}

/** Check if a stage marker exists. */
async function stageExists(root: string, name: string): Promise<boolean> {
  const markerDir = join(root, "stages");
  try {
    const entries = await readdir(markerDir);
    return entries.includes(`${name}.stage`);
  } catch {
    return false;
  }
}

/** Create a stage marker file. */
async function createStageMarker(root: string, name: string): Promise<void> {
  const markerDir = join(root, "stages");
  await mkdir(markerDir, { recursive: true });
  await writeFile(join(markerDir, `${name}.stage`), "", "utf8");
}

/** Delete a stage marker file. */
async function deleteStageMarker(root: string, name: string): Promise<void> {
  const marker = join(root, "stages", `${name}.stage`);
  try {
    await rm(marker);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

/** List all stages (by marker files). */
async function listStages(root: string): Promise<string[]> {
  const markerDir = join(root, "stages");
  try {
    const entries = await readdir(markerDir);
    return entries
      .filter((e) => e.endsWith(".stage"))
      .map((e) => e.slice(0, -6))
      .sort();
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

const ACTIONS = ["create", "use", "ls", "rm"] as const;

export function registerStage(program: Command): void {
  program
    .command("stage")
    .description("Manage deployment stages")
    .argument("<action>", `Action to perform (${ACTIONS.join("|")})`)
    .argument("[name]", "Stage name")
    .option("-o, --output <format>", "Output format (text|json)", "text")
    .action(
      async (
        action: string,
        name: string | undefined,
        opts: { output: OutputFormat },
      ) => {
        if (!ACTIONS.includes(action as (typeof ACTIONS)[number])) {
          throw new CliError(
            `Unknown action: ${action}. Expected one of: ${ACTIONS.join(", ")}`,
          );
        }

        const print = createPrinter({ format: opts.output });
        const root = vyftRoot(basename(process.cwd()));

        switch (action) {
          case "create": {
            if (!name)
              throw new CliError(`"vyft stage create" requires a name`);
            if (await stageExists(root, name)) {
              throw new CliError(`Stage "${name}" already exists.`);
            }

            await createStageMarker(root, name);
            await writeActiveStage(root, name);
            print.message(`Stage "${name}" created and set as active.`, {
              name,
            });
            break;
          }

          case "use": {
            if (!name) throw new CliError(`"vyft stage use" requires a name`);
            // "local" always exists implicitly
            if (name !== "local") {
              if (!(await stageExists(root, name))) {
                throw new CliError(
                  `Stage "${name}" does not exist. Run \`vyft stage create ${name}\` first.`,
                );
              }
            }
            await writeActiveStage(root, name);
            print.message(`Switched to stage "${name}".`, { name });
            break;
          }

          case "rm": {
            if (!name) throw new CliError(`"vyft stage rm" requires a name`);
            if (name === "local") {
              throw new CliError(`Cannot remove the "local" stage.`);
            }
            if (!(await stageExists(root, name))) {
              throw new CliError(`Stage "${name}" does not exist.`);
            }

            await deleteStageMarker(root, name);

            const active = await readActiveStage(root);
            if (active === name) {
              await writeActiveStage(root, "local");
            }

            print.message(`Stage "${name}" removed.`, { name });
            break;
          }

          case "ls": {
            const active = await readActiveStage(root);
            const stages = await listStages(root);

            // Always include "local"
            const allStages = new Set(stages);
            allStages.add("local");
            const sorted = [...allStages].sort();

            print.list(sorted, { active });
            break;
          }
        }
      },
    );
}
