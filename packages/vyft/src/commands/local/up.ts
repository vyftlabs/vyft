import path from "node:path";
import { spinner } from "@clack/prompts";
import { type ApplyEvent, apply, reconcile, toState, urn } from "@vyft/core";
import { PLATFORM_PROVIDER_NAME } from "@vyft/platform";
import { RUNTIME_PROVIDER_NAME } from "@vyft/runtime";
import { Command } from "commander";
import { loadConfig, resolveProjectName } from "../../config.ts";
import {
  buildContext,
  buildCurrentState,
  createCipher,
  loadSalt,
  openStore,
  resolvePassphrase,
  resolvePlatformProvider,
  resolveRuntimeProvider,
} from "../../runtime.ts";

// Reserved namespace — avoids conflicts with user-created context names
const LOCAL_CONTEXT = "__local__";

export default new Command("up")
  .description("Start local environment")
  .option("--project <name>", "Project name")
  .action(async (opts: { project?: string }) => {
    const cwd = process.cwd();
    const { entries, providers } = await loadConfig(cwd);
    const project = await resolveProjectName(cwd, opts.project);
    const stateDir = path.join(cwd, ".vyft", LOCAL_CONTEXT, project);

    // Local only runs image-based (runtime) services
    const runtimeEntries = entries.filter(
      (e) => urn.parse(e.urn).provider === RUNTIME_PROVIDER_NAME,
    );

    if (runtimeEntries.length === 0) {
      console.log("No image-based services found in config.");
      return;
    }

    providers[RUNTIME_PROVIDER_NAME] = resolveRuntimeProvider(
      "docker",
      project,
      LOCAL_CONTEXT,
    );
    providers[PLATFORM_PROVIDER_NAME] = resolvePlatformProvider(
      "remote",
      project,
      LOCAL_CONTEXT,
    );

    const store = await openStore(stateDir);
    const salt = await loadSalt(stateDir);
    const passphrase = await resolvePassphrase(project, "local");
    const cipher = createCipher(passphrase, salt);
    const ctx = buildContext(store, cipher, providers, stateDir);
    await reconcile(ctx);
    const current = buildCurrentState(store);
    const desired = toState(runtimeEntries);

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
      const message = err instanceof Error ? err.message : String(err);
      s.stop(`failed: ${message}`);
      throw err;
    } finally {
      await store.dispose();
    }
  });
