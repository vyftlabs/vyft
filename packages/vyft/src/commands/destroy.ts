import { confirm, isCancel } from "@clack/prompts";
import { destroy, reconcile } from "@vyft/core";
import { PLATFORM_PROVIDER_NAME } from "@vyft/platform";
import { RUNTIME_PROVIDER_NAME } from "@vyft/runtime";
import { Command } from "commander";
import { loadConfig, resolveName } from "../config.ts";
import { getCurrentContext } from "../contexts.ts";
import {
  buildContext,
  buildCurrentState,
  createCipher,
  loadSalt,
  openStore,
  resolvePassphrase,
  resolvePlatformProvider,
  resolveRuntimeProvider,
  resolveStateDir,
} from "../runtime.ts";
import { createTreeRenderer } from "../tree.ts";

export default new Command("destroy")
  .description("Destroy infrastructure")
  .option("--stage <name>", "Deployment stage", "production")
  .option("--name <name>", "Project name")
  .option("-y, --yes", "Skip confirmation")
  .action(async (opts: { stage: string; name?: string; yes?: boolean }) => {
    const cwd = process.cwd();
    const project = await resolveName(cwd, opts.name);
    const { providers } = await loadConfig(cwd, project);
    const context = await getCurrentContext(cwd);
    const stateDir = resolveStateDir(cwd, context.name, project, opts.stage);

    if (providers[RUNTIME_PROVIDER_NAME]) {
      providers[RUNTIME_PROVIDER_NAME] = resolveRuntimeProvider(
        context.entry.runtime,
        project,
        opts.stage,
      );
    }
    if (providers[PLATFORM_PROVIDER_NAME]) {
      providers[PLATFORM_PROVIDER_NAME] = resolvePlatformProvider(
        context.entry.platform,
        project,
        opts.stage,
      );
    }

    const store = await openStore(stateDir);
    const salt = await loadSalt(stateDir);
    const passphrase = await resolvePassphrase(project, "deploy");
    const cipher = createCipher(passphrase, salt);
    const ctx = buildContext(store, cipher, providers, stateDir);
    await reconcile(ctx);
    const current = buildCurrentState(store);
    const entries = Object.values(current.entries);

    if (entries.length === 0) {
      console.log("Nothing to destroy.");
      await store.dispose();
      return;
    }

    if (!opts.yes) {
      if (!process.stdin.isTTY) {
        console.error("Use -y to confirm destroy in non-interactive mode.");
        await store.dispose();
        process.exit(1);
      }
      const ok = await confirm({
        message: `Destroy ${entries.length} resource(s)?`,
      });
      if (isCancel(ok) || !ok) {
        await store.dispose();
        process.exit(0);
      }
    }

    const tree = createTreeRenderer({ entries });
    tree.start();

    try {
      await destroy(current, ctx, { onEvent: tree.onEvent });
    } finally {
      tree.stop();
      await store.dispose();
    }
  });
