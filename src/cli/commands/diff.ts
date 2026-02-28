import type { Command } from "commander";
import type { RuntimeName } from "../../config.ts";
import { projectInfo } from "../../config.ts";
import { CliError } from "../../errors.ts";
import * as log from "../../logger.ts";
import { createRuntime } from "../../runtimes/index.ts";
import { decrypt } from "../../store/encrypt.ts";
import { createFileStore } from "../../store/file.ts";
import { resolvePassphrase } from "../../store/passphrase.ts";
import type { Store } from "../../store/types.ts";
import { withLifecycle } from "../lifecycle.ts";

interface DiffState {
  store: Store;
  context: string;
  project: string;
  runtimeName: RuntimeName;
  unlock: () => Promise<void>;
}

export function registerDiff(program: Command): void {
  program
    .command("diff")
    .description("Compare stored state against live infrastructure")
    .option("-v, --verbose", "Enable verbose output", false)
    .action(
      withLifecycle<DiffState>({
        async setup() {
          const { root, context, project, runtimeName } = await projectInfo();
          const store = createFileStore(root);
          const unlock = await store.lock(context, project);
          return { store, context, project, runtimeName, unlock };
        },

        async run({ store, context, project, runtimeName }) {
          const previous = await store.load(context, project);
          if (!previous || previous.resources.length === 0) {
            throw new CliError("No state to diff. Run `vyft deploy` first.");
          }

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
          if (!runtime.inspect) {
            throw new CliError("Runtime does not support inspection.");
          }

          let driftCount = 0;
          let missingCount = 0;

          for (const rs of previous.resources) {
            if (rs.kind === "secret") continue; // Secrets have no runtime presence

            const live = await runtime.inspect(rs.id, rs.kind);
            if (!live) {
              log.step("missing", rs.id);
              missingCount++;
              continue;
            }

            // Compare stored inputs against live state
            const storedKeys = Object.keys(rs.inputs).sort();
            const liveKeys = Object.keys(live).sort();
            const allKeys = [...new Set([...storedKeys, ...liveKeys])].sort();

            let hasDrift = false;
            for (const key of allKeys) {
              const storedVal = JSON.stringify(rs.inputs[key]);
              const liveVal = JSON.stringify(live[key]);
              if (storedVal !== liveVal) {
                if (!hasDrift) {
                  log.step("drift", rs.id);
                  hasDrift = true;
                  driftCount++;
                }
                log.debug(
                  "  %s: %s → %s",
                  key,
                  storedVal ?? "undefined",
                  liveVal ?? "undefined",
                );
              }
            }
          }

          if (driftCount === 0 && missingCount === 0) {
            log.info("no drift detected");
          } else {
            log.info("%d drifted, %d missing", driftCount, missingCount);
            process.exitCode = 1;
          }
        },

        async cleanup(state) {
          await state?.unlock();
        },
      }),
    );
}
