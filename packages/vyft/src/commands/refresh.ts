import { refresh } from "@vyft/core";
import type { Command } from "commander";

export function registerRefresh(program: Command): void {
  program
    .command("refresh")
    .description("Inspect live infrastructure and reconcile state")
    .option("-v, --verbose", "Enable verbose output", false)
    .option(
      "--clear-pending",
      "Only clear pending operations without full refresh",
      false,
    )
    .option("--stage <stage>", "Stage to refresh")
    .action(async (opts: { clearPending?: boolean; stage?: string }) => {
      await refresh({
        stage: opts.stage,
        clearPending: opts.clearPending,
      });
    });
}
