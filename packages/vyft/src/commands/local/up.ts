import { Command } from "commander";

export const up = new Command("up")
  .description("Start local environment")
  .action(() => {
    throw new Error("not implemented");
  });
