import { confirm, isCancel, spinner } from "@clack/prompts";
import { type ApplyEvent, destroy, reconcile } from "@vyft/core";
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

export default new Command("destroy")
  .description("Destroy infrastructure")
  .option("--stage <name>", "Deployment stage", "production")
  .option("--project <name>", "Project name")
  .option("-y, --yes", "Skip confirmation")
  .action(async (opts: { stage: string; project?: string; yes?: boolean }) => {
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
        project,
        opts.stage,
      );
    }

    const store = await openStore(stateDir);
    const salt = await loadSalt(stateDir);
    const passphrase = await resolvePassphrase();
    const cipher = createCipher(passphrase, salt);
    const ctx = buildContext(store, cipher, providers, stateDir);
    await reconcile(ctx);
    const current = buildCurrentState(store);
    const count = Object.keys(current.entries).length;

    if (count === 0) {
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
        message: `Destroy ${count} resource(s)?`,
      });
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
