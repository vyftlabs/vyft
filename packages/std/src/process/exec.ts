import { z } from "zod";
import { t } from "../provider.ts";
import { executeCommand, readStdinFile } from "./lib.ts";

/**
 * Execute a shell command and capture its output.
 *
 * Runs a command with optional stdin, environment variables, and working directory.
 * Supports input file tracking for cache invalidation and output file patterns
 * for cache restoration — both resolved by the engine, not the handler.
 *
 * @example
 * ```ts
 * // Simple command
 * std.process.exec({ command: ["echo", "hello"] })
 *
 * // Build with caching
 * std.process.exec({
 *   command: ["npm", "run", "build"],
 *   cwd: "./my-project",
 *   inputs: ["src/**", "package.json"],
 *   outputs: ["dist/**"],
 * })
 *
 * // Pipe stdin from file
 * std.process.exec({
 *   command: ["wc", "-l"],
 *   stdinFile: "./data.txt",
 * })
 *
 * // Literal stdin
 * std.process.exec({
 *   command: ["wc", "-c"],
 *   stdin: "hello world",
 * })
 * ```
 *
 * @returns Object containing `stdout` and `stderr` artifact references
 */
export const exec = t.resource
  .input(
    z.object({
      command: z
        .array(z.string())
        .min(1)
        .describe("Command to execute as an array of strings"),
      stdin: z.string().optional().describe("Literal string to pipe to stdin"),
      stdinFile: z
        .string()
        .optional()
        .describe("File path to pipe to stdin (resolved relative to cwd)"),
      env: z
        .record(z.string(), z.string())
        .optional()
        .describe("Environment variables to set for the command"),
      cwd: z
        .string()
        .optional()
        .describe("Working directory for command execution"),
      timeout: z.number().optional().describe("Timeout in milliseconds"),
      inputs: z
        .array(z.string())
        .optional()
        .describe(
          "Glob patterns for input files — used by the engine for cache invalidation",
        ),
      outputs: z
        .array(z.string())
        .optional()
        .describe(
          "Glob patterns for output files — used by the engine to check cache freshness",
        ),
      exclude: z
        .array(z.string())
        .optional()
        .describe("Glob patterns to exclude from inputs and outputs"),
    }),
  )
  .handle({
    async create({ input, artifacts }) {
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

      const stdoutRef = await artifacts.write("stdout", stdout);
      const stderrRef = await artifacts.write("stderr", stderr);

      return {
        output: {
          stdout: stdoutRef,
          stderr: stderrRef,
        },
      };
    },
  });
