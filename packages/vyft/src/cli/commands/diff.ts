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
            // Skip non-inspectable resource kinds
            // Cronjobs use a wrapper container, so live state doesn't match stored config
            if (
              rs.kind === "secret" ||
              rs.kind === "config" ||
              rs.kind === "cronjob"
            )
              continue;

            const live = await runtime.inspect(rs.id, rs.kind);
            if (!live) {
              log.step("missing", rs.id);
              missingCount++;
              continue;
            }

            // Compare stored inputs against live state
            // Only check keys that were explicitly set in the stored inputs
            // Live state may have additional keys (from image defaults, etc.)
            const storedKeys = Object.keys(rs.inputs).sort();

            // Volume name prefix for normalizing mount sources
            const volumePrefix = `vyft-${project}-${stage}-`;

            let hasDrift = false;
            for (const key of storedKeys) {
              const storedInput = rs.inputs[key];
              const liveInput = live[key];

              // Special handling for env: do subset comparison with config resolution
              // Stored env values may be config key references that need resolution
              if (
                key === "env" &&
                typeof storedInput === "object" &&
                storedInput !== null &&
                typeof liveInput === "object" &&
                liveInput !== null
              ) {
                const storedEnv = storedInput as Record<string, string>;
                const liveEnv = liveInput as Record<string, string>;
                for (const envKey of Object.keys(storedEnv)) {
                  // Resolve config references: if the stored value is a config key, get its value
                  const rawStoredValue = storedEnv[envKey] ?? "";
                  const storedValue =
                    secretMap.get(rawStoredValue) ?? rawStoredValue;
                  if (storedValue !== liveEnv[envKey]) {
                    if (!hasDrift) {
                      log.step("drift", rs.id);
                      hasDrift = true;
                      driftCount++;
                    }
                    log.debug(
                      "  env.%s: %s → %s",
                      envKey,
                      JSON.stringify(storedValue) ?? "undefined",
                      JSON.stringify(liveEnv[envKey]) ?? "undefined",
                    );
                  }
                }
                continue;
              }

              // Special handling for mounts: normalize volume names
              if (
                key === "mounts" &&
                Array.isArray(storedInput) &&
                Array.isArray(liveInput)
              ) {
                const storedMounts = storedInput as Array<{
                  source: string;
                  path: string;
                }>;
                const liveMounts = liveInput as Array<{
                  source: string;
                  path: string;
                }>;

                for (const storedMount of storedMounts) {
                  // Find matching mount by path
                  const liveMount = liveMounts.find(
                    (m) => m.path === storedMount.path,
                  );
                  if (!liveMount) {
                    if (!hasDrift) {
                      log.step("drift", rs.id);
                      hasDrift = true;
                      driftCount++;
                    }
                    log.debug(
                      "  mounts: missing mount at %s",
                      storedMount.path,
                    );
                    continue;
                  }

                  // Compare source - live has full name, stored has logical name
                  const expectedSource = volumePrefix + storedMount.source;
                  if (
                    liveMount.source !== expectedSource &&
                    liveMount.source !== storedMount.source
                  ) {
                    if (!hasDrift) {
                      log.step("drift", rs.id);
                      hasDrift = true;
                      driftCount++;
                    }
                    log.debug(
                      "  mounts[%s]: %s → %s",
                      storedMount.path,
                      expectedSource,
                      liveMount.source,
                    );
                  }
                }
                continue;
              }

              const storedVal = JSON.stringify(storedInput);
              const liveVal = JSON.stringify(liveInput);
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
