import { readFile } from "node:fs/promises";
import path from "node:path";
import { projectInfo } from "@vyft/core";
import * as log from "@vyft/core/logger";
import { deploy as engineDeploy } from "@vyft/engine";
import { createFileStore } from "@vyft/store";
import type { Command } from "commander";
import { createRuntime } from "../../runtime-factory.ts";
import { DEV_STAGE, registerDev } from "./dev.ts";

async function loadDevSecrets(
  secretsPath: string,
): Promise<Map<string, string>> {
  try {
    const raw = await readFile(secretsPath, "utf8");
    return new Map(Object.entries(JSON.parse(raw) as Record<string, string>));
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return new Map();
    throw err;
  }
}

export function registerLocal(program: Command): void {
  const local = program
    .command("local")
    .description("Local development commands");

  registerDev(local);

  local
    .command("reset")
    .description("Reset local containers and data")
    .action(async () => {
      const { root, context, project, runtimeName } = await projectInfo();
      const stage = DEV_STAGE;
      const store = createFileStore(root);

      const previous = await store.load(context, project, stage);
      if (!previous || previous.resources.length === 0) {
        log.info("nothing to reset");
        await store.delete(context, project, stage);
        return;
      }

      // Local dev uses plain JSON secrets — no passphrase needed
      const secretsPath = path.join(root, "dev-secrets.json");
      const secretMap = await loadDevSecrets(secretsPath);

      const runtime = createRuntime(runtimeName, {
        project,
        stage,
        secrets: secretMap,
      });

      await engineDeploy([], previous.resources, runtime);
      await runtime.finalize([]);
      await runtime.teardown();

      await store.delete(context, project, stage);
      log.info(
        "reset complete: destroyed %d resources",
        previous.resources.length,
      );
    });
}
