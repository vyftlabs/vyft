import fs from "node:fs";
import { spinner } from "@clack/prompts";
import { type ApplyEvent, apply, reconcile, toState } from "@vyft/core";
import { PLATFORM_PROVIDER_NAME } from "@vyft/platform";
import { RUNTIME_PROVIDER_NAME } from "@vyft/runtime";
import { Command } from "commander";
import { loadConfig, resolveProjectName } from "../../config.ts";
import { getCurrentContext } from "../../contexts.ts";
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
} from "../../runtime.ts";

const CONFIG_FILES = [
  "vyft.config.ts",
  "vyft.config.js",
  "vyft.config.mjs",
  "vyft.config.mts",
];

async function deployOnce(cwd: string, project: string, stage: string) {
  const { entries, providers } = await loadConfig(cwd);
  const context = await getCurrentContext(cwd);
  const stateDir = resolveStateDir(cwd, context.name, project, stage);

  if (providers[RUNTIME_PROVIDER_NAME]) {
    providers[RUNTIME_PROVIDER_NAME] = resolveRuntimeProvider(
      context.entry.runtime,
      project,
      stage,
    );
  }
  if (providers[PLATFORM_PROVIDER_NAME]) {
    providers[PLATFORM_PROVIDER_NAME] = resolvePlatformProvider(
      context.entry.platform,
      project,
      stage,
    );
  }

  const store = await openStore(stateDir);
  const salt = await loadSalt(stateDir);
  const passphrase = await resolvePassphrase(project, "local");
  const cipher = createCipher(passphrase, salt);
  const ctx = buildContext(store, cipher, providers, stateDir);
  await reconcile(ctx);
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
}

export default new Command("dev")
  .description("Start local development environment")
  .option("--stage <name>", "Deployment stage", "development")
  .option("--project <name>", "Project name")
  .action(async (opts: { stage: string; project?: string }) => {
    const cwd = process.cwd();
    const project = await resolveProjectName(cwd, opts.project);

    // Initial deploy
    console.log("Deploying...");
    try {
      await deployOnce(cwd, project, opts.stage);
    } catch (err) {
      console.error("Deploy failed:", err);
      // Continue watching even if initial deploy fails
    }
    console.log("\nWatching for changes... (Ctrl+C to stop)\n");

    // Watch config files for changes
    let debounce: ReturnType<typeof setTimeout> | null = null;

    const watcher = fs.watch(cwd, { recursive: false }, (_event, filename) => {
      if (!filename || !CONFIG_FILES.includes(filename)) return;

      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(async () => {
        console.log(`\nConfig changed: ${filename}`);
        console.log("Redeploying...");
        try {
          await deployOnce(cwd, project, opts.stage);
          console.log("Deploy complete.\n");
        } catch (err) {
          console.error("Deploy failed:", err, "\n");
        }
      }, 300);
    });

    // Clean up on exit
    const cleanup = () => {
      watcher.close();
      if (debounce) clearTimeout(debounce);
      process.exit(0);
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
  });
