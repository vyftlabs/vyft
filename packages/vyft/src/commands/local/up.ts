import { spinner } from "@clack/prompts";
import { type ApplyEvent, apply, reconcile, toState, urn } from "@vyft/core";
import docker from "@vyft/docker";
import { RUNTIME_PROVIDER_NAME } from "@vyft/runtime";
import { Command } from "commander";
import { loadConfig, resolveProjectName } from "../../config.ts";
import {
  buildContext,
  buildCurrentState,
  createCipher,
  loadSalt,
  openStore,
  resolveLocalStateDir,
  resolvePassphrase,
} from "../../runtime.ts";

export default new Command("up")
  .description("Start local environment")
  .option("--project <name>", "Project name")
  .action(async (opts: { project?: string }) => {
    const cwd = process.cwd();
    const { entries } = await loadConfig(cwd);
    const project = await resolveProjectName(cwd, opts.project);

    const imageEntries = entries.filter((entry) => {
      const parsed = urn.parse(entry.urn);
      const value = entry.value as Record<string, unknown>;
      return parsed.provider === RUNTIME_PROVIDER_NAME && value["image"] != null;
    });

    if (imageEntries.length === 0) {
      console.log("No image-based services found in config.");
      return;
    }

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
    const desired = toState(imageEntries);

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
