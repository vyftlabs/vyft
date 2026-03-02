import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { RuntimeName } from "@vyft/core";
import {
  CliError,
  loadContextConfig,
  RUNTIMES,
  resolveContext,
  resolveStage,
  saveContextConfig,
  vyftRoot,
} from "@vyft/core";
import { createFileStore } from "@vyft/store";
import type { Command } from "commander";

function getRoot(): string {
  return vyftRoot(basename(process.cwd()));
}

async function readActive(root: string): Promise<string> {
  return resolveContext(root);
}

async function writeActive(root: string, name: string): Promise<void> {
  await mkdir(root, { recursive: true });
  await writeFile(join(root, "active"), `${name}\n`, "utf8");
}

async function contextExists(root: string, name: string): Promise<boolean> {
  try {
    const s = await stat(join(root, name));
    return s.isDirectory();
  } catch {
    return false;
  }
}

const ACTIONS = ["create", "use", "ls", "rm", "show"] as const;

export function registerContext(program: Command): void {
  program
    .command("context")
    .description("Manage deployment contexts")
    .argument("<action>", `Action to perform (${ACTIONS.join("|")})`)
    .argument("[name]", "Context name")
    .option(`--runtime <runtime>`, `Runtime target (${RUNTIMES.join("|")})`)
    .action(
      async (
        action: string,
        name: string | undefined,
        opts: { runtime?: string },
      ) => {
        if (!ACTIONS.includes(action as (typeof ACTIONS)[number])) {
          throw new CliError(
            `Unknown action: ${action}. Expected one of: ${ACTIONS.join(", ")}`,
          );
        }

        const root = getRoot();

        switch (action) {
          case "create": {
            if (!name)
              throw new CliError(`"vyft context create" requires a name`);
            if (await contextExists(root, name)) {
              throw new CliError(`Context "${name}" already exists.`);
            }
            if (!opts.runtime) {
              throw new CliError(
                `"vyft context create" requires --runtime (${RUNTIMES.join("|")})`,
              );
            }
            if (!RUNTIMES.includes(opts.runtime as RuntimeName)) {
              throw new CliError(
                `Unknown runtime "${opts.runtime}". Expected one of: ${RUNTIMES.join(", ")}`,
              );
            }

            const runtime = opts.runtime as RuntimeName;

            await mkdir(join(root, name), { recursive: true });
            await saveContextConfig(root, name, { runtime });
            await writeActive(root, name);
            console.log(
              `Context "${name}" created (runtime: ${runtime}) and set as active.`,
            );
            break;
          }

          case "use": {
            if (!name) throw new CliError(`"vyft context use" requires a name`);
            if (!(await contextExists(root, name))) {
              throw new CliError(
                `Context "${name}" does not exist. Run \`vyft context create ${name}\` first.`,
              );
            }
            await writeActive(root, name);
            console.log(`Switched to context "${name}".`);
            break;
          }

          case "rm": {
            if (!name) throw new CliError(`"vyft context rm" requires a name`);
            if (!(await contextExists(root, name))) {
              throw new CliError(`Context "${name}" does not exist.`);
            }

            const active = await readActive(root);
            await rm(join(root, name), { recursive: true, force: true });

            if (active === name) {
              await writeActive(root, "default");
            }

            console.log(`Context "${name}" removed.`);
            break;
          }

          case "show": {
            if (!name)
              throw new CliError(`"vyft context show" requires a name`);
            if (!(await contextExists(root, name))) {
              throw new CliError(`Context "${name}" does not exist.`);
            }

            const active = await readActive(root);
            const hasPassphrase = !!process.env["VYFT_PASSPHRASE"];
            const ctxConfig = await loadContextConfig(root, name);
            const store = createFileStore(root);

            // List all projects in this context
            const contextDir = join(root, name);
            const entries = await readdir(contextDir);
            const projects: string[] = [];
            for (const entry of entries) {
              if (entry === "lock" || entry === "config.json") continue;
              const s = await stat(join(contextDir, entry));
              if (s.isDirectory()) projects.push(entry);
            }

            console.log(
              `Context: ${name}${active === name ? " (active)" : ""}`,
            );
            console.log(`  Runtime: ${ctxConfig?.runtime ?? "not configured"}`);
            console.log(
              `  Passphrase: ${hasPassphrase ? "set (via VYFT_PASSPHRASE)" : "not set"}`,
            );

            const stage = await resolveStage(root);

            if (projects.length === 0) {
              console.log("  Projects: none");
            } else {
              console.log("  Projects:");
              for (const p of projects) {
                const state = await store.load(name, p, stage);
                const count = state?.resources.length ?? 0;
                console.log(
                  `    ${p}: ${count} resource${count !== 1 ? "s" : ""}`,
                );
              }
            }
            break;
          }

          case "ls": {
            const active = await readActive(root);
            let entries: string[];
            try {
              entries = await readdir(root);
            } catch (err: unknown) {
              if ((err as NodeJS.ErrnoException).code === "ENOENT") {
                console.log(
                  "No contexts. Run `vyft context create <name>` to get started.",
                );
                return;
              }
              throw err;
            }

            const contexts: string[] = [];
            for (const entry of entries) {
              if (entry === "active") continue;
              const s = await stat(join(root, entry));
              if (s.isDirectory()) contexts.push(entry);
            }

            if (contexts.length === 0) {
              console.log(
                "No contexts. Run `vyft context create <name>` to get started.",
              );
              return;
            }

            for (const ctx of contexts.sort()) {
              const marker = ctx === active ? " *" : "";
              console.log(`${ctx}${marker}`);
            }
            break;
          }
        }
      },
    );
}
