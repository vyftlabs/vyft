import { Command } from "commander";
import { add } from "./add.ts";
import { list } from "./list.ts";
import { remove } from "./remove.ts";

export const context = new Command("context").description(
  "Context management commands",
);

context.addCommand(list);
context.addCommand(add);
context.addCommand(remove);
