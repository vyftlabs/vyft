import { Command } from "commander";
import context from "./commands/context/index.ts";
import deploy from "./commands/deploy.ts";
import destroy from "./commands/destroy.ts";
import diff from "./commands/diff.ts";
import init from "./commands/init.ts";
import local from "./commands/local/index.ts";
import refresh from "./commands/refresh.ts";

const program = new Command("vyft").description("Vyft CLI").version("0.0.0");

program.addCommand(init);
program.addCommand(deploy);
program.addCommand(destroy);
program.addCommand(refresh);
program.addCommand(diff);
program.addCommand(local);
program.addCommand(context);

program.parse();
