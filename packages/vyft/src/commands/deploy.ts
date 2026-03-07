import { spinner } from "@clack/prompts";
import { type ApplyEvent, apply, toState } from "@vyft/core";
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

export default new Command("deploy")
  .description("Deploy infrastructure")
  .option("--stage <name>", "Deployment stage", "production")
  .option("--project <name>", "Project name")
  .action(async (opts: { stage: string; project?: string }) => {
    const cwd = process.cwd();
    const { entries, providers } = await loadConfig(cwd);
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
    const desired = toState(entries);

    const s = spinner();

    try {
      await apply(desired, current, ctx, {
        onEvent(event: ApplyEvent) {
          if (event.status === "pending") {
            s.start(`${event.action} ${event.urn}`);
          } else {
            s.stop(`${event.action} ${event.urn}`);
          }
        },
      });
    } catch (err) {
      s.stop("failed");
      throw err;
    } finally {
      await store.dispose();
    }
  });
