import fs from "node:fs/promises";
import path from "node:path";
import { intro, outro } from "@clack/prompts";
import { Command } from "commander";

const CONFIG_TEMPLATE = `import { service } from "vyft";

export const api = service("api", {
  path: ".",
  port: 3000,
});
`;

export default new Command("init")
  .description("Initialize a new vyft project")
  .action(async () => {
    const cwd = process.cwd();
    intro("vyft init");

    // Check if config already exists
    const configPath = path.join(cwd, "vyft.config.ts");
    let configExists = false;
    try {
      await fs.access(configPath);
      configExists = true;
    } catch {
      // Does not exist
    }

    // Write config file
    if (!configExists) {
      await fs.writeFile(configPath, CONFIG_TEMPLATE);
      console.log("  Created vyft.config.ts");
    } else {
      console.log("  vyft.config.ts already exists, skipping");
    }

    // Add .vyft to .gitignore
    const gitignorePath = path.join(cwd, ".gitignore");
    try {
      const content = await fs.readFile(gitignorePath, "utf8");
      if (!content.includes(".vyft")) {
        await fs.appendFile(gitignorePath, "\n.vyft/\n");
        console.log("  Added .vyft/ to .gitignore");
      }
    } catch {
      await fs.writeFile(gitignorePath, ".vyft/\n");
      console.log("  Created .gitignore with .vyft/");
    }

    outro("Ready! Run `vyft deploy` to deploy.");
  });
