import { Command } from "commander";

export const refresh = new Command("refresh")
  .description("Refresh infrastructure state")
  .action(() => {
    throw new Error("not implemented");
  });
