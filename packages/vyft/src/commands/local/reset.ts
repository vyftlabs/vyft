import { Command } from "commander";

export const reset = new Command("reset")
  .description("Reset local environment")
  .action(() => {
    throw new Error("not implemented");
  });
