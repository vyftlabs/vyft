import { CliError, projectInfo, resolveStage } from "@vyft/core";
import { createFileStore, decrypt, resolvePassphrase } from "@vyft/store";
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

        const store = createFileStore(root);
        const state = await store.load(context, project, stage);

        if (!state || state.resources.length === 0) {
          throw new CliError("No deployed resources. Run `vyft deploy` first.");
        }

        // Decrypt secret outputs if --show-secrets is set
        let secretOutputs: Record<string, Record<string, string>> = {};
        if (opts.showSecrets && state.secretOutputs) {
          const passphrase = await resolvePassphrase();
          secretOutputs = JSON.parse(
            decrypt(state.secretOutputs, passphrase),
          ) as Record<string, Record<string, string>>;
        }

        const resources = resource
          ? state.resources.filter((r) => r.id === resource)
          : state.resources;

        if (resource && resources.length === 0) {
          throw new CliError(`Resource "${resource}" not found in state.`);
        }

        if (opts.json) {
          const obj: Record<string, unknown> = {};
          for (const r of resources) {
            const outputs = { ...r.outputs };
            const resSecrets = secretOutputs[r.id];
            if (resSecrets) {
              for (const [key, value] of Object.entries(resSecrets)) {
                outputs[key] = value;
              }
            }
            obj[r.id] = outputs;
          }
          console.log(JSON.stringify(obj, null, 2));
          return;
        }

        for (const r of resources) {
          const outputs = { ...r.outputs };
          const resSecrets = secretOutputs[r.id];
          if (resSecrets) {
            for (const [key, value] of Object.entries(resSecrets)) {
              outputs[key] = value;
            }
          }
          const entries = Object.entries(outputs);
          if (entries.length === 0) continue;
          console.log(`${r.kind}/${r.id}:`);
          for (const [key, value] of entries) {
            console.log(`  ${key}: ${value}`);
          }
        }
      },
    );
}
