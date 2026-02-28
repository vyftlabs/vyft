import type { Command } from "commander";
import type { RuntimeName } from "../../config.ts";
import { findConfig, loadConfig, projectInfo } from "../../config.ts";
import type { StateHook } from "../../engine/index.ts";
import {
  buildGraph,
  collect,
  deploy as engineDeploy,
} from "../../engine/index.ts";
import { CliError } from "../../errors.ts";
import { generateSecret } from "../../generate.ts";
import * as log from "../../logger.ts";
import type { Secret, Service } from "../../resource.ts";
import { createRuntime } from "../../runtimes/index.ts";
import { decrypt, encrypt } from "../../store/encrypt.ts";
import { createFileStore } from "../../store/file.ts";
import { resolvePassphrase } from "../../store/passphrase.ts";
import type {
  PersistedState,
  ResourceState,
  Store,
} from "../../store/types.ts";
import { withLifecycle } from "../lifecycle.ts";

interface DeployState {
  store: Store;
  context: string;
  project: string;
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
    .action(
      withLifecycle<DeployState>({
        async setup(opts: { refresh?: boolean } = {}) {
          const { root, context, project, runtimeName } = await projectInfo();
          const store = createFileStore(root);
          const unlock = await store.lock(context, project);
          return {
            store,
            context,
            project,
            runtimeName,
            refresh: !!opts.refresh,
            unlock,
          };
        },

        async run({ store, context, project, runtimeName, refresh }) {
          const configPath = await findConfig(process.cwd());
          const config = await loadConfig(configPath);
          log.info("loaded config from %s", configPath);

          const previous = await store.load(context, project);

          if (await store.hasWAL(context, project)) {
            throw new CliError(
              `Previous deploy did not complete cleanly. ` +
                `Run \`vyft cancel\` to clear, or \`vyft refresh\` to reconcile before deploying.`,
            );
          }

          const previousResources = previous?.resources ?? [];

          // Resolve secrets for runtime
          const passphrase = await resolvePassphrase();
          const secretMap = new Map<string, string>();
          if (previous?.secrets) {
            const raw = JSON.parse(
              decrypt(previous.secrets, passphrase),
            ) as Record<string, string>;
            for (const [k, v] of Object.entries(raw)) secretMap.set(k, v);
          }

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

          const resources = collect(config);
          const graph = buildGraph(resources);

          // Auto-generate missing secret values
          const secretResources = resources.filter(
            (r): r is Secret => r.kind === "secret",
          );
          let secretsChanged = false;
          for (const sr of secretResources) {
            if (!secretMap.has(sr.id)) {
              if (sr.config.generated === false) continue;
              secretMap.set(
                sr.id,
                generateSecret(sr.config.length, sr.config.alphabet),
              );
              secretsChanged = true;
            }
          }

          // Persist any newly generated secrets
          let currentSecrets = previous?.secrets ?? null;
          if (secretsChanged) {
            const allSecrets = Object.fromEntries(secretMap);
            currentSecrets = encrypt(JSON.stringify(allSecrets), passphrase);
            const snapshot: PersistedState = {
              version: previous?.version ?? 1,
              manifest: { timestamp: new Date().toISOString(), tool: "vyft" },
              resources: previousResources,
              secrets: currentSecrets,
            };
            await store.save(context, project, snapshot);
          }

          // Build tainted set — find resources that depend on secrets whose values changed
          const oldSecrets = new Map<string, string>();
          if (previous?.secrets) {
            const raw = JSON.parse(
              decrypt(previous.secrets, passphrase),
            ) as Record<string, string>;
            for (const [k, v] of Object.entries(raw)) oldSecrets.set(k, v);
          }

          const taintedIds = new Set<string>();
          for (const sr of secretResources) {
            const oldVal = oldSecrets.get(sr.id);
            const newVal = secretMap.get(sr.id);
            if (oldVal !== undefined && oldVal !== newVal) {
              for (const [id, deps] of graph.dependencies) {
                if (deps.has(sr.id)) taintedIds.add(id);
              }
            }
          }

          const runtime = createRuntime(runtimeName, {
            project,
            secrets: secretMap,
          });

          // When --refresh is set, inspect live state to detect drift
          let effectivePrevious = previousResources;
          if (refresh && runtime.inspect && previousResources.length > 0) {
            log.info("inspecting live infrastructure...");
            const inspected: ResourceState[] = [];
            for (const rs of previousResources) {
              if (rs.kind === "secret") {
                inspected.push(rs); // Secrets have no runtime presence
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

          // Post-deploy: finalize proxy/ingress
          const services = resources.filter(
            (r): r is Service => r.kind === "service",
          );
          await runtime.finalize(services);

          // Merge runtime state into resource states
          const runtimeStateMap = runtime.runtimeState();
          const finalResources = result.state.map((rs) => {
            const extra = runtimeStateMap.get(rs.id);
            if (extra) return { ...rs, runtime: { ...rs.runtime, ...extra } };
            return rs;
          });

          // Final compact — atomic state write + WAL cleanup
          const state: PersistedState = {
            version: 1,
            manifest: { timestamp: new Date().toISOString(), tool: "vyft" },
            resources: finalResources,
            secrets: currentSecrets,
          };

          await store.compact(context, project, state);
          log.info("state saved (%d resources)", finalResources.length);
        },

        async cleanup(state) {
          await state?.unlock();
        },
      }),
    );
}
