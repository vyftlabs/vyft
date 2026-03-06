import fs from "node:fs/promises";
import path from "node:path";
import { intro, outro, select } from "@clack/prompts";
import { Command } from "commander";
import { addContext, readContexts } from "../contexts.ts";

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

    // Set up context if none exists
    const contexts = await readContexts(cwd);
    if (Object.keys(contexts.contexts).length === 0) {
      const runtime = (await select({
        message: "Select runtime",
        options: [{ value: "docker", label: "Docker" }],
      })) as string;

      if (typeof runtime === "symbol") process.exit(1);

      await addContext(cwd, "default", {
        platform: "local",
        runtime,
      });
      console.log("  Created context: default");
    } else {
      console.log(
        `  Context already configured: ${contexts.current ?? Object.keys(contexts.contexts)[0]}`,
      );
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
