import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import context from "./commands/context/index.ts";
import deploy from "./commands/deploy.ts";
import destroy from "./commands/destroy.ts";
import diff from "./commands/diff.ts";
import init from "./commands/init.ts";
import dev from "./commands/local/dev.ts";
import down from "./commands/local/down.ts";
import reset from "./commands/local/reset.ts";
import up from "./commands/local/up.ts";
import refresh from "./commands/refresh.ts";

const pkg = JSON.parse(
  fs.readFileSync(
    path.resolve(import.meta.dirname, "..", "package.json"),
    "utf8",
  ),
) as { version: string };

const program = new Command("vyft")
  .description("Vyft CLI")
  .version(pkg.version);

program.addCommand(init);
program.addCommand(deploy);
program.addCommand(destroy);
program.addCommand(refresh);
program.addCommand(diff);
program.addCommand(dev);
program.addCommand(up);
program.addCommand(down);
program.addCommand(reset);
program.addCommand(context);

program.parse();
