import { logger } from "@vyft/logger";
import type { Command } from "commander";
import { generate } from "../generate.ts";

export function registerGenerate(program: Command): void {
  program
    .command("generate")
    .description("Generate typed resource module from config")
    .action(async () => {
      const entries = await generate(process.cwd());
      logger.info("generated env module (%d export(s))", entries.length);
    });
}
