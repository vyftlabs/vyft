import type { Command } from "commander";
import { projectInfo } from "../../config.ts";
import { CliError } from "../../errors.ts";
import { createFileStore } from "../../store/file.ts";

export function registerOutput(program: Command): void {
  program
    .command("output")
    .description("Show resource outputs")
    .argument("[resource]", "Filter by resource ID")
    .option("-j, --json", "Output as JSON", false)
    .action(async (resource: string | undefined, opts: { json: boolean }) => {
      const { root, context, project } = await projectInfo();

      const store = createFileStore(root);
      const state = await store.load(context, project);

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
    });
}
