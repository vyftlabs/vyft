import type { RuntimeName } from "@vyft/core";
import { CliError, projectInfo } from "@vyft/core";
import * as log from "@vyft/core/logger";
import type { StateHook } from "@vyft/engine";
import { deploy as engineDeploy } from "@vyft/engine";
import type { Store } from "@vyft/store";
import { createFileStore, decrypt, resolvePassphrase } from "@vyft/store";
import type { Command } from "commander";
import { createRuntime } from "../../runtime-factory.ts";
import { withLifecycle } from "../lifecycle.ts";

interface DestroyState {
  store: Store;
  context: string;
  project: string;
  runtimeName: RuntimeName;
  unlock: () => Promise<void>;
}

export function registerDestroy(program: Command): void {
  program
    .command("destroy")
    .description("Tear down resources")
    .option("-v, --verbose", "Enable verbose output", false)
    .action(
      withLifecycle<DestroyState>({
        async setup() {
          const { root, context, project, runtimeName } = await projectInfo();
          const store = createFileStore(root);
          const unlock = await store.lock(context, project);
          return { store, context, project, runtimeName, unlock };
        },

        async run({ store, context, project, runtimeName }) {
          const previous = await store.load(context, project);
          if (!previous || previous.resources.length === 0) {
            log.info("nothing to destroy");
            return;
          }

          if (await store.hasWAL(context, project)) {
            throw new CliError(
              `Previous operation did not complete cleanly. ` +
                `Run \`vyft cancel\` to clear, or \`vyft refresh\` to reconcile before destroying.`,
            );
          }

          // Resolve secrets for runtime
          const passphrase = await resolvePassphrase();
          const secretMap = new Map<string, string>();
          if (previous.secrets) {
            const raw = JSON.parse(
              decrypt(previous.secrets, passphrase),
            ) as Record<string, string>;
            for (const [k, v] of Object.entries(raw)) secretMap.set(k, v);
          }

          const runtime = createRuntime(runtimeName, {
            project,
            secrets: secretMap,
          });

          const onState: StateHook = async (event) => {
            if (event.type === "pending") {
              await store.appendLog(context, project, {
                type: "pending",
                id: event.id,
                operation: event.operation,
              });
            } else if (event.type === "committed") {
              await store.appendLog(context, project, {
                type: "committed",
                id: event.id,
                state: event.state,
              });
            } else {
              await store.appendLog(context, project, {
                type: "removed",
                id: event.id,
              });
            }
          };

          await engineDeploy([], previous.resources, runtime, onState);

          // Post-deploy: finalize with no services, then full teardown
          await runtime.finalize([]);
          await runtime.teardown();

          await store.delete(context, project);
          log.info("destroyed %d resources", previous.resources.length);
        },

        async cleanup(state) {
          await state?.unlock();
        },
      }),
    );
}
