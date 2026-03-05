import { Command } from "commander";

export const dev = new Command("dev")
  .description("Start local development environment")
  .action(() => {
    throw new Error("not implemented");
  });
