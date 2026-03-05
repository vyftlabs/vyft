import { Command } from "commander";

export const diff = new Command("diff")
  .description("Show infrastructure changes")
  .action(() => {
    throw new Error("not implemented");
  });
