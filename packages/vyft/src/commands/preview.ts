import type { PreviewChange } from "@vyft/core";
import { preview } from "@vyft/core";
import { logger } from "@vyft/logger";
import type { Command } from "commander";

const symbols: Record<PreviewChange["status"], string> = {
  create: "+",
  modify: "~",
  remove: "-",
};

function formatChange(change: PreviewChange): string {
  return `  ${symbols[change.status]} ${change.kind}/${change.id}`;
}

export function registerPreview(program: Command): void {
  program
    .command("preview")
    .description("Preview planned changes")
    .option("-v, --verbose", "Enable verbose output", false)
    .option("--stage <stage>", "Stage to preview")
    .option("-o, --output <format>", "Output format (text|json)", "text")
    .action(async (opts: { stage?: string; output: string }) => {
      const changes = await preview({ stage: opts.stage });

      if (opts.output === "json") {
        console.log(JSON.stringify(changes));
        return;
      }

      if (changes.length === 0) {
        logger.info("no changes detected");
        return;
      }

      console.log(`\n${changes.length} change(s):\n`);
      for (const change of changes) {
        console.log(formatChange(change));
      }
      console.log();
    });
}
