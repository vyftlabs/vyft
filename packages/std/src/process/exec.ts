import type { ArtifactRef } from "@vyft/core";
import { defineResource } from "@vyft/provider";
import { executeCommand, readStdinFile } from "./lib.ts";

export interface ExecOutputs {
  stdout: ArtifactRef;
  stderr: ArtifactRef;
}

export interface ExecArgs {
  command: string[];
  stdin?: string;
  stdinFile?: string;
  env?: Record<string, string>;
  cwd?: string;
  timeout?: number;
  inputs?: string[];
  outputs?: string[];
  exclude?: string[];
}

export const exec = defineResource<ExecArgs, ExecOutputs>("exec", {
  async create({ input, ctx }) {
    if (input.stdin !== undefined && input.stdinFile !== undefined) {
      throw new Error("Cannot specify both stdin and stdinFile");
    }

    const cwd = input.cwd ?? process.cwd();

    let stdinData: string | undefined;
    if (input.stdinFile !== undefined) {
      stdinData = await readStdinFile(input.stdinFile, cwd);
    } else if (input.stdin !== undefined) {
      stdinData = input.stdin;
    }

    const { stdout, stderr } = await executeCommand(
      input.command,
      cwd,
      input.env,
      stdinData,
      input.timeout,
    );

    const stdoutRef = await ctx.artifacts.write("stdout", stdout);
    const stderrRef = await ctx.artifacts.write("stderr", stderr);

    return {
      output: {
        stdout: stdoutRef,
        stderr: stderrRef,
      },
    };
  },
});
