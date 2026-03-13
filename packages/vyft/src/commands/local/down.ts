import { destroy, reconcile } from "@vyft/core";
import docker from "@vyft/docker";
import { RUNTIME_PROVIDER_NAME } from "@vyft/runtime";
import { Command } from "commander";
import { loadConfig, resolveName } from "../../config.ts";
import {
  buildContext,
  buildCurrentState,
  createCipher,
  loadSalt,
  openStore,
  resolveLocalStateDir,
  resolvePassphrase,
} from "../../runtime.ts";
import { createTreeRenderer } from "../../tree.ts";

export default new Command("down")
  .description("Stop local environment")
  .option("--name <name>", "Project name")
  .action(async (opts: { name?: string }) => {
    const cwd = process.cwd();
    const project = await resolveName(cwd, opts.name);
    const stateDir = resolveLocalStateDir(cwd, project);
    const { providers: configProviders } = await loadConfig(cwd, project);
    const providers = {
      ...configProviders,
      [RUNTIME_PROVIDER_NAME]: docker({ project, stage: "local" }),
    };

    const store = await openStore(stateDir);
    const salt = await loadSalt(stateDir);
    const passphrase = await resolvePassphrase(project, "local");
    const cipher = createCipher(passphrase, salt);
    const ctx = buildContext(store, cipher, providers, stateDir);
    await reconcile(ctx);
    const current = buildCurrentState(store);
    const entries = Object.values(current.entries);

    if (entries.length === 0) {
      console.log("Nothing to stop.");
      await store.dispose();
      return;
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
