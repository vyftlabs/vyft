import { Command } from "commander";

export const destroy = new Command("destroy")
  .description("Destroy infrastructure")
  .action(() => {
    throw new Error("not implemented");
  });
