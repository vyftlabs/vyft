import { Command } from "commander";

export default new Command("up")
  .description("Start local environment")
  .action(() => {
    throw new Error("not implemented");
  });
