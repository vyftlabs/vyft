import { Command } from "commander";

export default new Command("down")
  .description("Stop local environment")
  .action(() => {
    throw new Error("not implemented");
  });
