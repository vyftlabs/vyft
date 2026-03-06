import { Command } from "commander";
import { addContext } from "../../contexts.ts";

export default new Command("add")
  .alias("a")
  .description("Add a context")
  .argument("<name>", "Context name")
  .requiredOption("--platform <platform>", "Platform (e.g. aws, gcp, azure)")
  .requiredOption("--runtime <runtime>", "Runtime (e.g. ecr, ecs, k8s)")
  .action(async (name: string, opts: { platform: string; runtime: string }) => {
    const cwd = process.cwd();
    await addContext(cwd, name, {
      platform: opts.platform,
      runtime: opts.runtime,
    });
    console.log(`Context "${name}" added.`);
  });
