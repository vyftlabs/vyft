import { Command } from "commander";

export const down = new Command("down")
  .description("Stop local environment")
  .action(() => {
    throw new Error("not implemented");
  });
