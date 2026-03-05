import { destroy } from "@vyft/core";
import type { Command } from "commander";

export function registerDestroy(program: Command): void {
  program
    .command("destroy")
    .description("Tear down resources")
    .option("-v, --verbose", "Enable verbose output", false)
    .option("-y, --yes", "Skip confirmation prompt", false)
    .option("--stage <stage>", "Stage to destroy")
    .action(async (opts: { stage?: string }) => {
      await destroy({ stage: opts.stage });
    });
}
