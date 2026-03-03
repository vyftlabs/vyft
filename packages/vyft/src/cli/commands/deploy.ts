import type { Config, CronJob, RuntimeName, Service } from "@vyft/core";
import {
  buildImage,
  CliError,
  findConfig,
  fingerprint,
  generateSecret,
  imageDigest,
  isSecretConfig,
  loadConfig,
  projectInfo,
  resolveStage,
} from "@vyft/core";
import * as log from "@vyft/core/logger";
import type { StateHook } from "@vyft/engine";
import {
  buildGraph,
  checkDuplicateIds,
  collect,
  deploy as engineDeploy,
} from "@vyft/engine";
import type { PersistedState, ResourceState, Store } from "@vyft/store";
import {
  createFileStore,
  createStageStore,
  decrypt,
  encrypt,
  resolvePassphrase,
} from "@vyft/store";
import type { Command } from "commander";
import { createRuntime } from "../../runtime-factory.ts";
import { withLifecycle } from "../lifecycle.ts";

interface DeployState {
  store: Store;
  context: string;
  project: string;
  stage: string;
  runtimeName: RuntimeName;
  refresh: boolean;
  unlock: () => Promise<void>;
}

export function registerDeploy(program: Command): void {
  program
    .command("deploy")
    .description("Deploy resources")
    .option("-v, --verbose", "Enable verbose output", false)
    .option("-c, --config <path>", "Path to config file", "vyft.config.ts")
    .option("--refresh", "Inspect live state before planning", false)
    .option("--stage <stage>", "Stage to deploy")
    .action(
      withLifecycle<DeployState>({
        async setup(opts: { refresh?: boolean; stage?: string } = {}) {
          const { root, context, project, runtimeName } = await projectInfo();
          const stage = opts.stage ?? (await resolveStage(root));
          const store = createFileStore(root);
          const unlock = await store.lock(context, project, stage);
          return {
            store,
            context,
            project,
            stage,
            runtimeName,
            refresh: !!opts.refresh,
            unlock,
          };
        },

        async run({ store, context, project, stage, runtimeName, refresh }) {
          const configPath = await findConfig(process.cwd());
          const config = await loadConfig(configPath);
          log.info("loaded config from %s", configPath);

          // Load state - this replays any WAL entries to get full picture
          const previous = await store.load(context, project, stage);
          const previousResources = previous?.resources ?? [];

          // Load config values from stage storage
          const root = (await projectInfo()).root;
          const stageStore = createStageStore(root);
          const stageData = await stageStore.loadStage(stage);

          const passphrase = await resolvePassphrase();
          const secretMap = new Map<string, string>();

          // Load plain values from stage
          if (stageData?.values) {
            for (const [k, v] of Object.entries(stageData.values)) {
              secretMap.set(k, v);
            }
          }

          // Load encrypted values from stage
          if (stageData?.secrets) {
            const raw = JSON.parse(
              decrypt(stageData.secrets, passphrase),
            ) as Record<string, string>;
            for (const [k, v] of Object.entries(raw)) secretMap.set(k, v);
          }

          // Fallback: also load from PersistedState.secrets for backward compat
          // (stage takes precedence — values loaded above win)
          if (previous?.secrets) {
            const raw = JSON.parse(
              decrypt(previous.secrets, passphrase),
            ) as Record<string, string>;
            for (const [k, v] of Object.entries(raw)) {
              if (!secretMap.has(k)) secretMap.set(k, v);
            }
          }

          const onState: StateHook = async (event) => {
            if (event.type === "pending") {
              await store.appendLog(context, project, stage, {
                type: "pending",
                id: event.id,
                operation: event.operation,
              });
            } else if (event.type === "committed") {
              await store.appendLog(context, project, stage, {
                type: "committed",
                id: event.id,
                state: event.state,
              });
            } else {
              await store.appendLog(context, project, stage, {
                type: "removed",
                id: event.id,
              });
            }
          };

          const resources = collect(config);
          checkDuplicateIds(resources);
          const graph = buildGraph(resources);

          // Auto-generate missing secret values for config({ secret: true })
          const configResources = resources.filter(
            (r): r is Config => r.kind === "config",
          );
          let secretsChanged = false;
          for (const cr of configResources) {
            if (!secretMap.has(cr.id)) {
              if (isSecretConfig(cr.config)) {
                if (cr.config.generated === false) continue;
                secretMap.set(
                  cr.id,
                  generateSecret(cr.config.length, cr.config.alphabet),
                );
                secretsChanged = true;
              } else {
                // Plain config with no value set — error
                throw new CliError(
                  `Config "${cr.id}" has no value. Set it with: vyft config set ${cr.id} <value> --stage ${stage}`,
                );
              }
            }
          }

          // Persist newly generated secrets to stage storage
          if (secretsChanged) {
            const currentStageData = (await stageStore.loadStage(stage)) ?? {
              version: 1,
              values: {},
              secrets: null,
            };
            // Collect all secret values to encrypt
            const stageSecrets: Record<string, string> = {};
            if (currentStageData.secrets) {
              const existing = JSON.parse(
                decrypt(currentStageData.secrets, passphrase),
              ) as Record<string, string>;
              Object.assign(stageSecrets, existing);
            }
            for (const cr of configResources) {
              if (isSecretConfig(cr.config) && secretMap.has(cr.id)) {
                const val = secretMap.get(cr.id);
                if (val !== undefined) stageSecrets[cr.id] = val;
              }
            }
            await stageStore.saveStage(stage, {
              ...currentStageData,
              secrets: encrypt(JSON.stringify(stageSecrets), passphrase),
            });
          }

          // Also persist secrets in PersistedState for backward compat
          const allSecrets = Object.fromEntries(secretMap);
          const currentSecrets = encrypt(
            JSON.stringify(allSecrets),
            passphrase,
          );
          const snapshot: PersistedState = {
            version: previous?.version ?? 1,
            manifest: { timestamp: new Date().toISOString(), tool: "vyft" },
            resources: previousResources,
            secrets: currentSecrets,
            secretOutputs: previous?.secretOutputs ?? null,
          };
          await store.save(context, project, stage, snapshot);

          // Build tainted set — find resources that depend on secrets whose values changed
          const oldSecrets = new Map<string, string>();
          if (previous?.secrets) {
            const raw = JSON.parse(
              decrypt(previous.secrets, passphrase),
            ) as Record<string, string>;
            for (const [k, v] of Object.entries(raw)) oldSecrets.set(k, v);
          }

          const taintedIds = new Set<string>();
          for (const cr of configResources) {
            const oldVal = oldSecrets.get(cr.id);
            const newVal = secretMap.get(cr.id);
            if (oldVal !== undefined && oldVal !== newVal) {
              for (const [id, deps] of graph.dependencies) {
                if (deps.has(cr.id)) taintedIds.add(id);
              }
            }
          }

          // Pre-build services/cronjobs whose config is unchanged but source may have changed.
          // If the config fingerprint already differs, the engine will recreate the
          // container (and build the image) through the normal path — no need to
          // build here.
          const imageDigests = new Map<string, string>();
          const buildables = resources.filter(
            (r): r is Service | CronJob =>
              (r.kind === "service" || r.kind === "cronjob") &&
              !!r.config.build,
          );
          for (const r of buildables) {
            const prev = previousResources.find((rs) => rs.id === r.id);
            // New resource or config changed → engine handles the build
            if (!prev || prev.fingerprint !== fingerprint(r)) continue;

            const build = r.config.build;
            if (!build) continue;
            const tag = `vyft-build-${r.id}:latest`;
            log.info('building image for "%s"...', r.id);
            const { digest } = await buildImage(tag, build);
            imageDigests.set(r.id, digest);
            const prevDigest = prev.runtime?.["imageDigest"] as
              | string
              | undefined;
            if (prevDigest !== digest) {
              log.info(
                'image digest changed for "%s", tainting for redeploy',
                r.id,
              );
              taintedIds.add(r.id);
            }
          }

          const runtime = createRuntime(runtimeName, {
            project,
            stage,
            secrets: secretMap,
          });

          // When --refresh is set, inspect live state to detect drift
          let effectivePrevious = previousResources;
          if (refresh && runtime.inspect && previousResources.length > 0) {
            log.info("inspecting live infrastructure...");
            const inspected: ResourceState[] = [];
            for (const rs of previousResources) {
              if (rs.kind === "secret" || rs.kind === "config") {
                inspected.push(rs);
                continue;
              }
              const live = await runtime.inspect(rs.id, rs.kind);
              if (live) {
                inspected.push({
                  ...rs,
                  inputs: live,
                  fingerprint: JSON.stringify(live),
                });
              }
              // null = gone from live → omit so plan() sees it as new → create
            }
            effectivePrevious = inspected;
          }

          const result = await engineDeploy(
            resources,
            effectivePrevious,
            runtime,
            onState,
            taintedIds,
          );

          // Encrypt secret outputs from providers
          const secretOutputObj: Record<string, Record<string, string>> = {};
          for (const [id, secrets] of result.secretOutputs) {
            secretOutputObj[id] = secrets;
          }
          const encryptedSecretOutputs =
            Object.keys(secretOutputObj).length > 0
              ? encrypt(JSON.stringify(secretOutputObj), passphrase)
              : null;

          // Post-deploy: finalize proxy/ingress
          const services = resources.filter(
            (r): r is Service => r.kind === "service",
          );
          await runtime.finalize(services);

          // Capture digests for build services that went through the normal engine path
          for (const r of buildables) {
            if (!imageDigests.has(r.id)) {
              const tag = `vyft-build-${r.id}:latest`;
              imageDigests.set(r.id, await imageDigest(tag));
            }
          }

          // Merge runtime state and image digests into resource states
          const runtimeStateMap = runtime.runtimeState();
          const finalResources = result.state.map((rs) => {
            const extra = runtimeStateMap.get(rs.id);
            const digest = imageDigests.get(rs.id);
            const merged = {
              ...rs.runtime,
              ...extra,
              ...(digest ? { imageDigest: digest } : {}),
            };
            return { ...rs, runtime: merged };
          });

          // Final compact — atomic state write + WAL cleanup
          const state: PersistedState = {
            version: 1,
            manifest: { timestamp: new Date().toISOString(), tool: "vyft" },
            resources: finalResources,
            secrets: currentSecrets,
            secretOutputs: encryptedSecretOutputs,
          };

          await store.compact(context, project, stage, state);
          log.info("state saved (%d resources)", finalResources.length);
        },

        async cleanup(state) {
          await state?.unlock();
        },
      }),
    );
}
