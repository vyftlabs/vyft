import { Command } from "commander";
import { removeContext } from "../../contexts.ts";

export default new Command("remove")
  .alias("rm")
  .description("Remove a context")
  .argument("<name>", "Context name")
  .action(async (name: string) => {
    const cwd = process.cwd();
    await removeContext(cwd, name);
    console.log(`Context "${name}" removed.`);
  });
