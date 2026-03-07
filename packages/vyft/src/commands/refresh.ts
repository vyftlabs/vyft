import { refresh } from "@vyft/core";
import { PLATFORM_PROVIDER_NAME } from "@vyft/platform";
import { RUNTIME_PROVIDER_NAME } from "@vyft/runtime";
import { Command } from "commander";
import { loadConfig, resolveProjectName } from "../config.ts";
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

export default new Command("refresh")
  .description("Refresh infrastructure state")
  .option("--stage <name>", "Deployment stage", "production")
  .option("--project <name>", "Project name")
  .action(async (opts: { stage: string; project?: string }) => {
    const cwd = process.cwd();
    const { providers } = await loadConfig(cwd);
    const project = await resolveProjectName(cwd, opts.project);
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
      );
    }

    const store = await openStore(stateDir);
    const salt = await loadSalt(stateDir);
    const passphrase = await resolvePassphrase();
    const cipher = createCipher(passphrase, salt);
    const ctx = buildContext(store, cipher, providers, stateDir);
    const current = buildCurrentState(store);

    try {
      await refresh(current, ctx);
      console.log("State refreshed.");
    } finally {
      await store.dispose();
    }
  });
