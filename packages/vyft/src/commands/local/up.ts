import { apply, reconcile, toState, urn } from "@vyft/core";
import docker, { createClient } from "@vyft/docker";
import { RUNTIME_PROVIDER_NAME } from "@vyft/runtime";
import { Command } from "commander";
import { loadConfig, resolveName } from "../../config.ts";
import { waitForHealthy } from "../../health.ts";
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

export default new Command("up")
  .description("Start local environment")
  .option("--name <name>", "Project name")
  .action(async (opts: { name?: string }) => {
    const cwd = process.cwd();
    const project = await resolveName(cwd, opts.name);
    const { entries, providers: configProviders } = await loadConfig(
      cwd,
      project,
    );

    // Filter to infra entries: everything except native services (services without an explicit image)
    const infraEntries = entries.filter((entry) => {
      const parsed = urn.parse(entry.urn);
      if (
        parsed.provider !== RUNTIME_PROVIDER_NAME ||
        parsed.resource !== "service"
      ) {
        return true;
      }
      const config = entry.config as Record<string, unknown> | undefined;
      return typeof config?.["image"] === "string";
    });

    if (infraEntries.length === 0) {
      console.log("No infrastructure resources found in config.");
      return;
    }

    const stateDir = resolveLocalStateDir(cwd, project);
    const providers = {
      ...configProviders,
      [RUNTIME_PROVIDER_NAME]: docker({
        project,
        stage: "local",
        publishPorts: true,
      }),
    };

    const store = await openStore(stateDir);
    const salt = await loadSalt(stateDir);
    const passphrase = await resolvePassphrase(project, "local");
    const cipher = createCipher(passphrase, salt);
    const ctx = buildContext(store, cipher, providers, stateDir);
    await reconcile(ctx);
    const current = buildCurrentState(store);
    const desired = toState(infraEntries);

    const tree = createTreeRenderer({ entries: infraEntries });
    tree.start();

    try {
      await apply(desired, current, ctx, { onEvent: tree.onEvent });

      const healthContainers = infraEntries
        .filter((e) => e.value["health"] != null && e.value["image"] != null)
        .map((e) => ({
          name: `vyft-${project}-local-${String(e.value["name"])}`,
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
