import { Command } from "commander";
import { useContext } from "../../contexts.ts";

export default new Command("use")
  .description("Switch to a context")
  .argument("<name>", "Context name")
  .action(async (name: string) => {
    const cwd = process.cwd();
    await useContext(cwd, name);
    console.log(`Switched to context "${name}".`);
  });
