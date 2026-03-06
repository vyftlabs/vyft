import { Command } from "commander";
import { readContexts } from "../../contexts.ts";

export default new Command("list")
  .alias("ls")
  .description("List contexts")
  .action(async () => {
    const cwd = process.cwd();
    const data = await readContexts(cwd);

    if (Object.keys(data.contexts).length === 0) {
      console.log("No contexts configured.");
      return;
    }

    for (const [name, entry] of Object.entries(data.contexts)) {
      const marker = name === data.current ? "* " : "  ";
      console.log(
        `${marker}${name} (platform: ${entry.platform}, runtime: ${entry.runtime})`,
      );
    }
  });
