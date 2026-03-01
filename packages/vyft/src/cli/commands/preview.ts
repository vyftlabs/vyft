import type { Change } from "@vyft/core";
import { findConfig, loadConfig, projectInfo } from "@vyft/core";
import * as log from "@vyft/core/logger";
import { buildGraph, collect, order, plan, validate } from "@vyft/engine";
import { createFileStore } from "@vyft/store";
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

export function registerPreview(program: Command): void {
  program
    .command("preview")
    .description("Preview planned changes")
    .option("-v, --verbose", "Enable verbose output", false)
    .option("-c, --config <path>", "Path to config file", "vyft.config.ts")
    .action(async () => {
      const { cwd, root, context, project } = await projectInfo();

      const configPath = await findConfig(cwd);
      const config = await loadConfig(configPath);

      const resources = collect(config);
      const graph = buildGraph(resources);
      validate(graph);

      const store = createFileStore(root);
      const previous = await store.load(context, project);
      const previousResources = previous?.resources ?? [];

      const changes = plan(order(graph), previousResources);

      if (changes.length === 0) {
        log.info("no changes detected");
        return;
      }

      console.log(`\n${changes.length} change(s):\n`);
      for (const change of changes) {
        console.log(formatChange(change));
      }
      console.log();
    });
}
