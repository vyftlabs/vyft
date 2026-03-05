import { Command } from "commander";

export const list = new Command("list")
  .alias("ls")
  .description("List contexts")
  .action(() => {
    throw new Error("not implemented");
  });
