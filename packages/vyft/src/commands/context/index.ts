import { Command } from "commander";
import add from "./add.ts";
import list from "./list.ts";
import remove from "./remove.ts";
import use from "./use.ts";

export default new Command("context")
  .description("Context management commands")
  .addCommand(list)
  .addCommand(add)
  .addCommand(remove)
  .addCommand(use);
