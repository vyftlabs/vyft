import { confirm, isCancel, spinner } from "@clack/prompts";
import { type ApplyEvent, destroy, reconcile } from "@vyft/core";
import docker from "@vyft/docker";
import { RUNTIME_PROVIDER_NAME } from "@vyft/runtime";
import { Command } from "commander";
import { resolveName } from "../../config.ts";
import {
  buildContext,
  buildCurrentState,
  createCipher,
  loadSalt,
  openStore,
  resolveLocalStateDir,
  resolvePassphrase,
} from "../../runtime.ts";

export default new Command("down")
  .description("Stop local environment")
  .option("--name <name>", "Project name")
  .option("-y, --yes", "Skip confirmation")
  .action(async (opts: { name?: string; yes?: boolean }) => {
    const cwd = process.cwd();
    const project = await resolveName(cwd, opts.name);
    const stateDir = resolveLocalStateDir(cwd, project);
    const providers = {
      [RUNTIME_PROVIDER_NAME]: docker({ project, stage: "local" }),
    };

    const store = await openStore(stateDir);
    const salt = await loadSalt(stateDir);
    const passphrase = await resolvePassphrase(project, "local");
    const cipher = createCipher(passphrase, salt);
    const ctx = buildContext(store, cipher, providers, stateDir);
    await reconcile(ctx);
    const current = buildCurrentState(store);
    const count = Object.keys(current.entries).length;

    if (count === 0) {
      console.log("Nothing to stop.");
      await store.dispose();
      return;
    }

    if (!opts.yes) {
      if (!process.stdin.isTTY) {
        console.error("Use -y to confirm in non-interactive mode.");
        await store.dispose();
        process.exit(1);
      }
      const ok = await confirm({ message: `Stop ${count} container(s)?` });
      if (isCancel(ok) || !ok) {
        await store.dispose();
        process.exit(0);
      }
    }

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
  });
