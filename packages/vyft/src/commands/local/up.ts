import path from "node:path";
import { spinner } from "@clack/prompts";
import { type ApplyEvent, apply, reconcile, toState, urn } from "@vyft/core";
import docker from "@vyft/docker";
import local from "@vyft/local";
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
} from "../../runtime.ts";

function localStateDir(cwd: string, project: string): string {
  return path.join(cwd, ".vyft", "local", project);
}

export default new Command("up")
  .description("Start local environment")
  .option("--project <name>", "Project name")
  .action(async (opts: { project?: string }) => {
    const cwd = process.cwd();
    const { entries } = await loadConfig(cwd);
    const project = await resolveProjectName(cwd, opts.project);
    const stateDir = localStateDir(cwd, project);

    // Filter to image-based services only
    const imageServices = entries.filter((entry) => {
      const parsed = urn.parse(entry.urn);
      return (
        parsed.provider === RUNTIME_PROVIDER_NAME &&
        parsed.resource === "service" &&
        Boolean(entry.value["image"])
      );
    });

    if (imageServices.length === 0) {
      console.log("No image-based services found in config.");
      return;
    }

    const providers = {
      [RUNTIME_PROVIDER_NAME]: docker({ project, stage: "local" }),
      [PLATFORM_PROVIDER_NAME]: local({}),
    };

    const store = await openStore(stateDir);
    const salt = await loadSalt(stateDir);
    const cipher = createCipher("local", salt);
    const ctx = buildContext(store, cipher, providers, stateDir);
    await reconcile(ctx);
    const current = buildCurrentState(store);
    const desired = toState(imageServices);

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
