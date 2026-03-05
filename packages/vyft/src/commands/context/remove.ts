import { Command } from "commander";

export const remove = new Command("remove")
  .alias("rm")
  .description("Remove a context")
  .action(() => {
    throw new Error("not implemented");
  });
