import { diff } from "@vyft/core";
import type { Command } from "commander";

export function registerDiff(program: Command): void {
  program
    .command("diff")
    .description("Compare stored state against live infrastructure")
    .option("-v, --verbose", "Enable verbose output", false)
    .option("--stage <stage>", "Stage to diff")
    .action(async (opts: { stage?: string }) => {
      const result = await diff({ stage: opts.stage });
      if (result.driftCount > 0 || result.missingCount > 0) {
        process.exitCode = 1;
      }
    });
}
