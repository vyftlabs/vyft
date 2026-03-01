import { CliError, projectInfo, resolveStage } from "@vyft/core";
import { createFileStore } from "@vyft/store";
import type { Command } from "commander";

export function registerOutput(program: Command): void {
  program
    .command("output")
    .description("Show resource outputs")
    .argument("[resource]", "Filter by resource ID")
    .option("-j, --json", "Output as JSON", false)
    .option("--stage <stage>", "Stage to show outputs for")
    .action(
      async (
        resource: string | undefined,
        opts: { json: boolean; stage?: string },
      ) => {
        const { root, context, project } = await projectInfo();
        const stage = opts.stage ?? (await resolveStage(root));

        const store = createFileStore(root);
        const state = await store.load(context, project, stage);

        if (!state || state.resources.length === 0) {
          throw new CliError("No deployed resources. Run `vyft deploy` first.");
        }

        const resources = resource
          ? state.resources.filter((r) => r.id === resource)
          : state.resources;

        if (resource && resources.length === 0) {
          throw new CliError(`Resource "${resource}" not found in state.`);
        }

        if (opts.json) {
          const obj: Record<string, unknown> = {};
          for (const r of resources) obj[r.id] = r.outputs;
          console.log(JSON.stringify(obj, null, 2));
          return;
        }

        for (const r of resources) {
          const entries = Object.entries(r.outputs);
          if (entries.length === 0) continue;
          console.log(`${r.kind}/${r.id}:`);
          for (const [key, value] of entries) {
            console.log(`  ${key}: ${value}`);
          }
        }
      },
    );
}
