import type { RuntimeName } from "@vyft/core";
import { CliError, projectInfo, resolveStage } from "@vyft/core";
import * as log from "@vyft/core/logger";
import type { PersistedState, ResourceState, Store } from "@vyft/store";
import {
  createFileStore,
  createStageStore,
  decrypt,
  resolvePassphrase,
} from "@vyft/store";
import type { Command } from "commander";
import { createRuntime } from "../../runtime-factory.ts";
import { withLifecycle } from "../lifecycle.ts";

interface RefreshState {
  store: Store;
  context: string;
  project: string;
  stage: string;
  runtimeName: RuntimeName;
  clearPending: boolean;
  unlock: () => Promise<void>;
}

export function registerRefresh(program: Command): void {
  program
    .command("refresh")
    .description("Inspect live infrastructure and reconcile state")
    .option("-v, --verbose", "Enable verbose output", false)
    .option(
      "--clear-pending",
      "Only clear pending operations without full refresh",
      false,
    )
    .option("--stage <stage>", "Stage to refresh")
    .action(
      withLifecycle<RefreshState>({
        async setup(opts: { clearPending?: boolean; stage?: string } = {}) {
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
            clearPending: !!opts.clearPending,
            unlock,
          };
        },

        async run({
          store,
          context,
          project,
          stage,
          runtimeName,
          clearPending,
        }) {
          const previous = await store.load(context, project, stage);

          if (clearPending) {
            if (!(await store.hasWAL(context, project, stage))) {
              log.info("no pending operations to clear");
              return;
            }
            const state = await store.load(context, project, stage);
            if (state) {
              await store.compact(context, project, stage, state);
            }
            log.info("cleared pending operations");
            return;
          }

          if (!previous || previous.resources.length === 0) {
            throw new CliError("No state to refresh. Run `vyft deploy` first.");
          }

          if (await store.hasWAL(context, project, stage)) {
            log.warn("WAL exists — clearing pending operations during refresh");
          }

          // Load secrets for runtime inspection
          const passphrase = await resolvePassphrase();
          const secretMap = new Map<string, string>();

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
            if (rs.kind === "secret" || rs.kind === "config") {
              reconciled.push(rs);
              continue;
            }

            const live = await runtime.inspect(rs.id, rs.kind);
            if (!live) {
              log.step("gone", rs.id);
              removedCount++;
              continue;
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
            secretOutputs: previous.secretOutputs ?? null,
          };

          await store.compact(context, project, stage, state);

          if (removedCount === 0 && changedCount === 0) {
            log.info("live state matches stored state");
          } else {
            log.info(
              "refreshed: %d changed, %d gone",
              changedCount,
              removedCount,
            );
          }
        },

        async cleanup(state) {
          await state?.unlock();
        },
      }),
    );
}
