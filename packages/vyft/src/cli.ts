#!/usr/bin/env node
import { VyftError } from "@vyft/errors";
import { Command } from "commander";
import { registerVariable } from "./commands/config-cmd.ts";
import { registerContext } from "./commands/context.ts";
import { registerDeploy } from "./commands/deploy.ts";
import { registerDestroy } from "./commands/destroy.ts";
import { registerDiff } from "./commands/diff.ts";
import { registerGenerate } from "./commands/generate.ts";
import { registerLocal } from "./commands/local.ts";
import { registerOutput } from "./commands/output.ts";
import { registerPreview } from "./commands/preview.ts";
import { registerRefresh } from "./commands/refresh.ts";
import { registerStage } from "./commands/stage.ts";

const program = new Command();

program
  .name("vyft")
  .version("1.0.0")
  .description("Infrastructure deployment tool");

registerContext(program);
registerStage(program);
registerDeploy(program);
registerDestroy(program);
registerLocal(program);
registerVariable(program);
registerRefresh(program);
registerOutput(program);
registerPreview(program);
registerDiff(program);
registerGenerate(program);

program.parseAsync().catch((err: unknown) => {
  if (err instanceof VyftError) {
    console.error(err.message);
    process.exit(1);
  }
  if (err instanceof Error) {
    console.error(err.message);
    console.error(err.stack);
  } else {
    console.error(err);
  }
  process.exit(2);
});
