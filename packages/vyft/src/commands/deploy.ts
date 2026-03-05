import { deploy } from "@vyft/core";
import type { Command } from "commander";

export function registerDeploy(program: Command): void {
  program
    .command("deploy")
    .description("Deploy resources")
    .option("-v, --verbose", "Enable verbose output", false)
    .option("--refresh", "Inspect live state before planning", false)
    .option("--stage <stage>", "Stage to deploy")
    .action(async (opts: { refresh?: boolean; stage?: string }) => {
      await deploy({ stage: opts.stage, refresh: opts.refresh });
    });
}
