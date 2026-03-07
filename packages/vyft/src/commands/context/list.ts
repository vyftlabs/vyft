import { Command } from "commander";
import { readContexts } from "../../contexts.ts";

export default new Command("list")
  .alias("ls")
  .description("List contexts")
  .action(async () => {
    const cwd = process.cwd();
    const data = await readContexts(cwd);

    if (Object.keys(data.contexts).length === 0) {
      console.log("No contexts configured. Run `vyft context add` to create one.");
      return;
    }

    for (const [name, entry] of Object.entries(data.contexts)) {
      const active = name === data.current;
      const marker = active ? "\x1b[32m●\x1b[0m" : "\x1b[90m○\x1b[0m";
      const label = active ? `\x1b[1m${name}\x1b[0m` : name;
      const details = [`${entry.platform}/${entry.runtime}`];
      if (entry.connection?.host) details.push(entry.connection.host);
      if (entry.connection?.endpoint) details.push(entry.connection.endpoint);
      console.log(`${marker} ${label} \x1b[90m(${details.join(", ")})\x1b[0m`);
    }
  });
