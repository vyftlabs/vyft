import { apply, reconcile, registry, toState, urn } from "@vyft/core";
import { createClient } from "@vyft/docker";
import { PLATFORM_PROVIDER_NAME } from "@vyft/platform";
import { RUNTIME_PROVIDER_NAME } from "@vyft/runtime";
import { Command } from "commander";
import { loadConfig, resolveName } from "../config.ts";
import { getCurrentContext } from "../contexts.ts";
import { waitForHealthy } from "../health.ts";
import {
  buildContext,
  buildCurrentState,
  createCipher,
  loadSalt,
  openStore,
  resolvePassphrase,
  resolvePlatformProvider,
  resolveRuntimeProvider,
  resolveRuntimeStateDir,
  resolveStateDir,
} from "../runtime.ts";
import { createTreeRenderer } from "../tree.ts";

export default new Command("deploy")
  .description("Deploy infrastructure")
  .option("--stage <name>", "Deployment stage", "production")
  .option("--name <name>", "Project name")
  .action(async (opts: { stage: string; name?: string }) => {
    const cwd = process.cwd();
    const project = await resolveName(cwd, opts.name);
    const context = await getCurrentContext(cwd);

    // Resolve the runtime provider
    const runtimeProvider = resolveRuntimeProvider(
      context.entry.runtime,
      project,
      opts.stage,
    );

    // ── Phase 1: Runtime init ────────────────────────────────────
    if (runtimeProvider.config.init) {
      const runtimeStateDir = resolveRuntimeStateDir(context.name);
      const runtimeStore = await openStore(runtimeStateDir);
      const runtimeSalt = await loadSalt(runtimeStateDir);
      const passphrase = await resolvePassphrase(project, "deploy");
      const runtimeCipher = createCipher(passphrase, runtimeSalt);

      registry.begin();
      runtimeProvider.config.init();
      const initEntries = registry.collect();

      const runtimeCtx = buildContext(
        runtimeStore,
        runtimeCipher,
        { [RUNTIME_PROVIDER_NAME]: runtimeProvider },
        runtimeStateDir,
      );
      await reconcile(runtimeCtx);
      const runtimeCurrent = buildCurrentState(runtimeStore);
      const runtimeDesired = toState(initEntries);

      try {
        await apply(runtimeDesired, runtimeCurrent, runtimeCtx);
      } finally {
        await runtimeStore.dispose();
      }
    }

    // ── Phase 2: User resources ──────────────────────────────────
    const { entries, providers } = await loadConfig(cwd, project);

    if (providers[RUNTIME_PROVIDER_NAME]) {
      providers[RUNTIME_PROVIDER_NAME] = runtimeProvider;
    }
    if (providers[PLATFORM_PROVIDER_NAME]) {
      providers[PLATFORM_PROVIDER_NAME] = resolvePlatformProvider(
        context.entry.platform,
        project,
        opts.stage,
      );
    }

    const stateDir = resolveStateDir(cwd, context.name, project, opts.stage);
    const store = await openStore(stateDir);
    const salt = await loadSalt(stateDir);
    const passphrase = await resolvePassphrase(project, "deploy");
    const cipher = createCipher(passphrase, salt);
    const ctx = buildContext(store, cipher, providers, stateDir);
    await reconcile(ctx);
    const current = buildCurrentState(store);
    const desired = toState(entries);

    const tree = createTreeRenderer({ entries });
    tree.start();

    try {
      await apply(desired, current, ctx, { onEvent: tree.onEvent });

      const healthContainers = entries
        .filter((e) => {
          const parsed = urn.parse(e.urn);
          return (
            parsed.provider === RUNTIME_PROVIDER_NAME &&
            e.value["health"] != null
          );
        })
        .map((e) => ({
          name: `vyft-${project}-${opts.stage}-${String(e.value["name"])}`,
          urn: e.urn,
        }));

      if (healthContainers.length > 0) {
        await waitForHealthy(
          createClient(),
          healthContainers,
          tree.onHealthStatus,
        );
      }
    } finally {
      tree.stop();
      await store.dispose();
    }
  });
