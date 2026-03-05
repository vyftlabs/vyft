import { join } from "node:path";
import { CliError, parseURN, projectInfo, resolveStage } from "@vyft/core";
import { Store } from "@vyft/store";
import type { Command } from "commander";

export function registerOutput(program: Command): void {
  program
    .command("output")
    .description("Show resource outputs")
    .argument("[resource]", "Filter by resource ID")
    .option("-j, --json", "Output as JSON", false)
    .option("--show-secrets", "Reveal secret output values", false)
    .option("--stage <stage>", "Stage to show outputs for")
    .action(
      async (
        resource: string | undefined,
        opts: { json: boolean; showSecrets: boolean; stage?: string },
      ) => {
        const { root, context, project } = await projectInfo();
        const stage = opts.stage ?? (await resolveStage(root));

        const dir = join(root, context, project, stage);
        const store = await Store.open(dir);
        try {
          if (store.state.size === 0) {
            if (opts.json) {
              console.log(JSON.stringify({}));
              return;
            }
            throw new CliError(
              "No deployed resources. Run `vyft deploy` first.",
            );
          }

          const entries = [...store.state.values()];
          const resources = resource
            ? entries.filter((r) => parseURN(r.urn).id === resource)
            : entries;

          if (resource && resources.length === 0) {
            throw new CliError(`Resource "${resource}" not found in state.`);
          }

          if (opts.json) {
            const obj: Record<string, unknown> = {};
            for (const r of resources) {
              const { id: rId } = parseURN(r.urn);
              obj[rId] = r.outputs;
            }
            console.log(JSON.stringify(obj, null, 2));
            return;
          }

          for (const r of resources) {
            const { id: rId, resource: rKind } = parseURN(r.urn);
            const entries = Object.entries(r.outputs);
            if (entries.length === 0) continue;
            console.log(`${rKind}/${rId}:`);
            for (const [key, value] of entries) {
              console.log(`  ${key}: ${value}`);
            }
          }
        } finally {
          await store.dispose();
        }
      },
    );
}
