#!/usr/bin/env node
import { VyftError } from "@vyft/core";
import { Command } from "commander";
import { registerCancel } from "./commands/cancel.ts";
import { registerContext } from "./commands/context.ts";
import { registerDeploy } from "./commands/deploy.ts";
import { registerDestroy } from "./commands/destroy.ts";
import { registerDiff } from "./commands/diff.ts";
import { registerOutput } from "./commands/output.ts";
import { registerPreview } from "./commands/preview.ts";
import { registerRefresh } from "./commands/refresh.ts";
import { registerSecret } from "./commands/secret.ts";

const program = new Command();

program
  .name("vyft")
  .version("1.0.0")
  .description("Infrastructure deployment tool");

registerContext(program);
registerDeploy(program);
registerDestroy(program);
registerSecret(program);
registerRefresh(program);
registerOutput(program);
registerPreview(program);
registerCancel(program);
registerDiff(program);

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
