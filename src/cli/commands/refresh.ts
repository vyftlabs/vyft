import type { Command } from "commander";
import type { RuntimeName } from "../../config.ts";
import { findConfig, loadConfig, projectInfo } from "../../config.ts";
import {
  buildGraph,
  collect,
  fingerprint,
  validate,
} from "../../engine/index.ts";
import { CliError } from "../../errors.ts";
import * as log from "../../logger.ts";
import { createRuntime } from "../../runtimes/index.ts";
import { decrypt } from "../../store/encrypt.ts";
import { createFileStore } from "../../store/file.ts";
import { resolvePassphrase } from "../../store/passphrase.ts";
import type {
  PersistedState,
  ResourceState,
  Store,
} from "../../store/types.ts";
import { withLifecycle } from "../lifecycle.ts";

interface RefreshState {
  store: Store;
  context: string;
  project: string;
  runtimeName: RuntimeName;
  clearPending: boolean;
  live: boolean;
  unlock: () => Promise<void>;
}

export function registerRefresh(program: Command): void {
  program
    .command("refresh")
    .description("Reconcile state with current config")
    .option("-v, --verbose", "Enable verbose output", false)
    .option(
      "--clear-pending",
      "Only clear pending operations without full refresh",
      false,
    )
    .option(
      "--live",
      "Inspect live infrastructure instead of reconciling from config",
      false,
    )
    .action(
      withLifecycle<RefreshState>({
        async setup(opts: { clearPending?: boolean; live?: boolean } = {}) {
          const { root, context, project, runtimeName } = await projectInfo();
          const store = createFileStore(root);
          const unlock = await store.lock(context, project);
          return {
            store,
            context,
            project,
            runtimeName,
            clearPending: !!opts.clearPending,
            live: !!opts.live,
            unlock,
          };
        },

        async run({
          store,
          context,
          project,
          runtimeName,
          clearPending,
          live,
        }) {
          const previous = await store.load(context, project);

          if (clearPending) {
            if (!(await store.hasWAL(context, project))) {
              log.info("no pending operations to clear");
              return;
            }
            const state = await store.load(context, project);
            if (state) {
              await store.compact(context, project, state);
            }
            log.info("cleared pending operations");
            return;
          }

          if (!previous || previous.resources.length === 0) {
            throw new CliError("No state to refresh. Run `vyft deploy` first.");
          }

          if (await store.hasWAL(context, project)) {
            log.warn("WAL exists — clearing pending operations during refresh");
          }

          // --live mode: inspect live infrastructure and reconcile state
          if (live) {
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

            const now = new Date().toISOString();
            const reconciled: ResourceState[] = [];
            let removedCount = 0;
            let changedCount = 0;

            for (const rs of previous.resources) {
              if (rs.kind === "secret") {
                reconciled.push(rs); // Keep secrets as-is
                continue;
              }

              const live = await runtime.inspect(rs.id, rs.kind);
              if (!live) {
                log.step("gone", rs.id);
                removedCount++;
                continue; // Gone from live → remove from state
              }

              const liveFingerprint = JSON.stringify(live);
              if (liveFingerprint !== JSON.stringify(rs.inputs)) {
                log.step("update", rs.id);
                changedCount++;
                reconciled.push({ ...rs, inputs: live, modified: now });
              } else {
                reconciled.push(rs);
              }
            }

            const state: PersistedState = {
              version: previous.version,
              manifest: { timestamp: now, tool: "vyft" },
              resources: reconciled,
              secrets: previous.secrets,
            };

            await store.compact(context, project, state);

            if (removedCount === 0 && changedCount === 0) {
              log.info("live state matches stored state");
            } else {
              log.info(
                "live refresh: %d changed, %d removed",
                changedCount,
                removedCount,
              );
            }
            return;
          }

          const configPath = await findConfig(process.cwd());
          const config = await loadConfig(configPath);

          const resources = collect(config);
          const graph = buildGraph(resources);
          validate(graph);

          const previousMap = new Map<string, ResourceState>();
          for (const entry of previous.resources) {
            previousMap.set(entry.id, entry);
          }

          const now = new Date().toISOString();
          let updated = 0;
          let added = 0;
          let removed = 0;

          const refreshed: ResourceState[] = resources.map((r) => {
            const prev = previousMap.get(r.id);
            const fp = fingerprint(r);
            const deps = graph.dependencies.get(r.id);

            if (!prev) {
              added++;
              log.step("add", r.id);
            } else if (prev.fingerprint !== fp) {
              updated++;
              log.step("update", r.id);
            }

            return {
              id: r.id,
              kind: r.kind,
              fingerprint: fp,
              inputs: JSON.parse(JSON.stringify(r.config)) as Record<
                string,
                unknown
              >,
              outputs: prev?.outputs ?? {},
              dependencies: deps ? [...deps] : [],
              runtime: prev?.runtime ?? {},
              created: prev?.created ?? now,
              modified: prev
                ? prev.fingerprint !== fp
                  ? now
                  : prev.modified
                : now,
              taint: false,
            };
          });

          // Count resources in state but not in config
          const refreshedIds = new Set(refreshed.map((r) => r.id));
          for (const prev of previous.resources) {
            if (!refreshedIds.has(prev.id)) {
              removed++;
              log.step("remove", prev.id);
            }
          }

          const state: PersistedState = {
            version: previous.version,
            manifest: { timestamp: now, tool: "vyft" },
            resources: refreshed,
            secrets: previous.secrets,
          };

          await store.compact(context, project, state);

          if (added === 0 && updated === 0 && removed === 0) {
            log.info("state is up to date");
          } else {
            log.info(
              "refreshed: %d added, %d updated, %d removed",
              added,
              updated,
              removed,
            );
          }
        },

        async cleanup(state) {
          await state?.unlock();
        },
      }),
    );
}
