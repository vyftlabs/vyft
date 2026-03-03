import type { RuntimeName } from "@vyft/core";
import { CliError, projectInfo, resolveStage } from "@vyft/core";
import * as log from "@vyft/core/logger";
import type { Store } from "@vyft/store";
import {
  createFileStore,
  createStageStore,
  decrypt,
  resolvePassphrase,
} from "@vyft/store";
import type { Command } from "commander";
import { createRuntime } from "../../runtime-factory.ts";
import { withLifecycle } from "../lifecycle.ts";

interface DiffState {
  store: Store;
  context: string;
  project: string;
  stage: string;
  runtimeName: RuntimeName;
  unlock: () => Promise<void>;
}

export function registerDiff(program: Command): void {
  program
    .command("diff")
    .description("Compare stored state against live infrastructure")
    .option("-v, --verbose", "Enable verbose output", false)
    .option("--stage <stage>", "Stage to diff")
    .action(
      withLifecycle<DiffState>({
        async setup(opts: { stage?: string } = {}) {
          const { root, context, project, runtimeName } = await projectInfo();
          const stage = opts.stage ?? (await resolveStage(root));
          const store = createFileStore(root);
          const unlock = await store.lock(context, project, stage);
          return { store, context, project, stage, runtimeName, unlock };
        },

        async run({ store, context, project, stage, runtimeName }) {
          const previous = await store.load(context, project, stage);
          if (!previous || previous.resources.length === 0) {
            throw new CliError("No state to diff. Run `vyft deploy` first.");
          }

          const passphrase = await resolvePassphrase();
          const secretMap = new Map<string, string>();

          // Load from stage storage first
          const root = (await projectInfo()).root;
          const stageStore = createStageStore(root);
          const stageData = await stageStore.loadStage(stage);
          if (stageData?.values) {
            for (const [k, v] of Object.entries(stageData.values))
              secretMap.set(k, v);
          }
          if (stageData?.secrets) {
            const raw = JSON.parse(
              decrypt(stageData.secrets, passphrase),
            ) as Record<string, string>;
            for (const [k, v] of Object.entries(raw)) secretMap.set(k, v);
          }

          // Fallback to state secrets
          if (previous.secrets) {
            const raw = JSON.parse(
              decrypt(previous.secrets, passphrase),
            ) as Record<string, string>;
            for (const [k, v] of Object.entries(raw)) {
              if (!secretMap.has(k)) secretMap.set(k, v);
            }
          }

          const runtime = createRuntime(runtimeName, {
            project,
            stage,
            secrets: secretMap,
          });
          if (!runtime.inspect) {
            throw new CliError("Runtime does not support inspection.");
          }

          let driftCount = 0;
          let missingCount = 0;

          for (const rs of previous.resources) {
            if (rs.kind === "secret" || rs.kind === "config") continue;

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
