import type { Change, Config } from "@vyft/core";
import { findConfig, loadConfig, projectInfo, resolveStage } from "@vyft/core";
import * as log from "@vyft/core/logger";
import {
  buildGraph,
  checkDuplicateIds,
  collect,
  order,
  plan,
  validate,
} from "@vyft/engine";
import {
  createFileStore,
  createStageStore,
  decrypt,
  resolvePassphrase,
} from "@vyft/store";
import type { Command } from "commander";

const symbols: Record<Change["status"], string> = {
  create: "+",
  modify: "~",
  remove: "-",
};

function formatChange(change: Change): string {
  const sym = symbols[change.status];
  const id = change.status === "remove" ? change.id : change.resource.id;
  const kind = change.status === "remove" ? change.kind : change.resource.kind;
  return `  ${sym} ${kind}/${id}`;
}

interface PreviewChange {
  resource: string;
  kind: string;
  action: "create" | "update" | "delete";
}

function toJsonChange(change: Change): PreviewChange {
  if (change.status === "remove") {
    return { resource: change.id, kind: change.kind, action: "delete" };
  }
  return {
    resource: change.resource.id,
    kind: change.resource.kind,
    action: change.status === "create" ? "create" : "update",
  };
}

export function registerPreview(program: Command): void {
  program
    .command("preview")
    .description("Preview planned changes")
    .option("-v, --verbose", "Enable verbose output", false)
    .option("-c, --config <path>", "Path to config file", "vyft.config.ts")
    .option("--stage <stage>", "Stage to preview")
    .option("-o, --output <format>", "Output format (text|json)", "text")
    .action(
      async (opts: { stage?: string; output: string; verbose: boolean }) => {
        const { cwd, root, context, project } = await projectInfo();
        const stage = opts.stage ?? (await resolveStage(root));

        const configPath = await findConfig(cwd);
        const config = await loadConfig(configPath);

        const resources = collect(config);
        checkDuplicateIds(resources);
        const graph = buildGraph(resources);
        validate(graph);

        const store = createFileStore(root);
        const previous = await store.load(context, project, stage);
        const previousResources = previous?.resources ?? [];

        // Load config values to detect changes
        const stageStore = createStageStore(root);
        const stageData = await stageStore.loadStage(stage);
        const currentValues = new Map<string, string>();

        // Load plain values
        if (stageData?.values) {
          for (const [k, v] of Object.entries(stageData.values)) {
            currentValues.set(k, v);
          }
        }

        // Load encrypted values
        if (stageData?.secrets) {
          try {
            const passphrase = await resolvePassphrase();
            const raw = JSON.parse(
              decrypt(stageData.secrets, passphrase),
            ) as Record<string, string>;
            for (const [k, v] of Object.entries(raw)) currentValues.set(k, v);
          } catch {
            // Passphrase not available, skip secret comparison
          }
        }

        // Load old config values from previous state
        const oldValues = new Map<string, string>();
        if (previous?.secrets) {
          try {
            const passphrase = await resolvePassphrase();
            const raw = JSON.parse(
              decrypt(previous.secrets, passphrase),
            ) as Record<string, string>;
            for (const [k, v] of Object.entries(raw)) oldValues.set(k, v);
          } catch {
            // Passphrase not available
          }
        }

        // Find configs that changed and collect tainted resource IDs
        const taintedIds = new Set<string>();
        const configResources = resources.filter(
          (r): r is Config => r.kind === "config",
        );
        for (const cr of configResources) {
          const oldVal = oldValues.get(cr.id);
          const newVal = currentValues.get(cr.id);
          if (oldVal !== undefined && oldVal !== newVal) {
            // Find all resources that depend on this config
            for (const [id, deps] of graph.dependencies) {
              if (deps.has(cr.id)) taintedIds.add(id);
            }
          }
        }

        // Get initial changes from plan
        const changes = plan(order(graph), previousResources);

        // Add modify changes for tainted resources not already in changes
        const changedIds = new Set(
          changes.map((c) => (c.status === "remove" ? c.id : c.resource.id)),
        );
        for (const id of taintedIds) {
          if (!changedIds.has(id)) {
            const resource = resources.find((r) => r.id === id);
            if (resource) {
              const prev = previousResources.find((rs) => rs.id === id);
              changes.push({
                status: "modify",
                resource,
                previous: prev?.inputs,
              } as Change);
            }
          }
        }

        if (opts.output === "json") {
          console.log(JSON.stringify(changes.map(toJsonChange)));
          return;
        }

        if (changes.length === 0) {
          log.info("no changes detected");
          return;
        }

        console.log(`\n${changes.length} change(s):\n`);
        for (const change of changes) {
          console.log(formatChange(change));
        }
        console.log();
      },
    );
}
