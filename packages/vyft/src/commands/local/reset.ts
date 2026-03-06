import { Command } from "commander";

export default new Command("reset")
  .description("Reset local environment")
  .action(() => {
    throw new Error("not implemented");
  });
