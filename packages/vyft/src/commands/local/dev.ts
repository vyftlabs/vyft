import { Command } from "commander";

export default new Command("dev")
  .description("Start local development environment")
  .action(() => {
    throw new Error("not implemented");
  });
