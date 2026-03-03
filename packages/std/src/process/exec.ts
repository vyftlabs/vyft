import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as tar from "tar";
import { glob as tinyglob } from "tinyglobby";
import { z } from "zod";
import { t } from "../provider.ts";
import { executeCommand, resolveStdin } from "./lib.ts";

/**
 * Execute a shell command and capture its output.
 *
 * Runs a command with optional stdin, environment variables, and working directory.
 * Supports input file tracking for cache invalidation and output file capture for
 * cache restoration in CI/CD pipelines.
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
 *   stdin: "./data.txt",
 * })
 *
 * // With environment variables
 * std.process.exec({
 *   command: ["node", "script.js"],
 *   env: { NODE_ENV: "production" },
 * })
 * ```
 *
 * @returns Object containing `stdout` artifact reference
 */
export const exec = t
  .resource("exec")
  .input(
    z.object({
      command: z
        .array(z.string())
        .min(1)
        .describe("Command to execute as an array of strings"),
      stdin: z
        .string()
        .optional()
        .describe(
          "Stdin input - file path (starts with ./ or /) or literal string",
        ),
      env: z
        .record(z.string(), z.string())
        .optional()
        .describe("Environment variables to set for the command"),
      cwd: z
        .string()
        .optional()
        .describe("Working directory for command execution"),
      inputs: z
        .array(z.string())
        .optional()
        .describe(
          "Glob patterns for input files - used for cache invalidation",
        ),
      outputs: z
        .array(z.string())
        .optional()
        .describe(
          "Glob patterns for output files - captured as artifact for cache restoration",
        ),
      exclude: z
        .array(z.string())
        .optional()
        .describe("Glob patterns to exclude from inputs/outputs"),
    }),
  )
  .handle({
    async create({ input, ctx }) {
      const cwd = input.cwd ?? process.cwd();

      let stdinData: string | undefined;
      if (input.stdin !== undefined) {
        stdinData = await resolveStdin(input.stdin, cwd);
      }

      const { stdout } = await executeCommand(
        input.command,
        cwd,
        input.env,
        stdinData,
      );

      const stdoutRef = await ctx.artifacts.write("stdout", stdout);

      if (input.outputs !== undefined && input.outputs.length > 0) {
        const outputFiles = await tinyglob(input.outputs, {
          cwd,
          ...(input.exclude !== undefined ? { ignore: input.exclude } : {}),
          dot: true,
          onlyFiles: true,
        });

        if (outputFiles.length > 0) {
          const tarball = await createTarball(cwd, outputFiles);
          await ctx.artifacts.write("outputs", tarball);
        }
      }

      return {
        stdout: stdoutRef,
      };
    },
  });

async function createTarball(cwd: string, files: string[]): Promise<Buffer> {
  const tmpPath = path.join(os.tmpdir(), `exec-outputs-${Date.now()}.tar.gz`);
  await tar.create({ gzip: true, file: tmpPath, cwd }, files);
  const data = await fs.readFile(tmpPath);
  await fs.unlink(tmpPath);
  return data;
}
