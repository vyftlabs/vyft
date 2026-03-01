import path from "node:path";
import { fileURLToPath } from "node:url";
import { findConfig, loadConfig } from "@vyft/core";
import * as log from "@vyft/core/logger";
import type { Command } from "commander";
import { writeResource } from "../../generate.ts";

export function registerGenerate(program: Command): void {
  program
    .command("generate")
    .description("Generate typed resource module from config")
    .action(async () => {
      const configPath = await findConfig(process.cwd());
      const config = await loadConfig(configPath);
      log.info("loaded config from %s", configPath);

      const thisFile = fileURLToPath(import.meta.url);
      const distDir = path.resolve(path.dirname(thisFile), "..", "..");

      const entries = await writeResource(config, distDir);
      log.info("generated resource module (%d export(s))", entries.length);
    });
}
