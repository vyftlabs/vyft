import { Command } from "commander";

export const deploy = new Command("deploy")
  .description("Deploy infrastructure")
  .action(() => {
    throw new Error("not implemented");
  });
