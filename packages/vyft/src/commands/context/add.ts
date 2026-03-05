import { Command } from "commander";

export const add = new Command("add")
  .alias("a")
  .description("Add a context")
  .action(() => {
    throw new Error("not implemented");
  });
