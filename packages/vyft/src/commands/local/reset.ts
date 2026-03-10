import fs from "node:fs/promises";
import { confirm, isCancel, spinner } from "@clack/prompts";
import { type ApplyEvent, destroy, reconcile } from "@vyft/core";
import docker from "@vyft/docker";
import { RUNTIME_PROVIDER_NAME } from "@vyft/runtime";
import { Command } from "commander";
import { resolveProjectName } from "../../config.ts";
import {
  buildContext,
  buildCurrentState,
  createCipher,
  loadSalt,
  openStore,
  resolveLocalStateDir,
  resolvePassphrase,
} from "../../runtime.ts";

export default new Command("reset")
  .description("Reset local environment")
  .option("--project <name>", "Project name")
  .option("-y, --yes", "Skip confirmation")
  .action(async (opts: { project?: string; yes?: boolean }) => {
    const cwd = process.cwd();
    const project = await resolveProjectName(cwd, opts.project);
    const stateDir = resolveLocalStateDir(cwd, project);

    if (!opts.yes) {
      if (!process.stdin.isTTY) {
        console.error("Use -y to confirm in non-interactive mode.");
        process.exit(1);
      }
      const ok = await confirm({
        message: "Destroy local containers and wipe local state?",
      });
      if (isCancel(ok) || !ok) process.exit(0);
    }

    const providers = {
      [RUNTIME_PROVIDER_NAME]: docker({ project, stage: "local" }),
    };

    try {
      const store = await openStore(stateDir);
      const salt = await loadSalt(stateDir);
      const passphrase = await resolvePassphrase(project, "local");
      const cipher = createCipher(passphrase, salt);
      const ctx = buildContext(store, cipher, providers, stateDir);
      await reconcile(ctx);
      const current = buildCurrentState(store);

      if (Object.keys(current.entries).length > 0) {
        const s = spinner();
        try {
          await destroy(current, ctx, {
            onEvent(event: ApplyEvent) {
              if (event.status === "pending") {
                s.start(`${event.action} ${event.urn}`);
              } else {
                s.stop(`${event.action} ${event.urn}`);
              }
            },
          });
        } finally {
          await store.dispose();
        }
      } else {
        await store.dispose();
      }
    } catch {
      // State may not exist yet; proceed to wipe
    }

    await fs.rm(stateDir, { recursive: true, force: true });
    console.log("Local state wiped.");
  });
