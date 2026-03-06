import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as tar from "tar";
import { glob as tinyglob } from "tinyglobby";
import { z } from "zod";
import { t } from "../provider.ts";

/**
 * Match files with glob patterns and create an archive.
 *
 * @example
 * ```ts
 * std.fs.glob({
 *   cwd: "./src",
 *   include: ["**\/*.ts"],
 *   exclude: ["**\/*.test.ts"]
 * })
 * ```
 */
export const glob = t.resource
  .input(
    z.object({
      cwd: z.string().describe("Working directory for glob patterns"),
      include: z.array(z.string()).describe("Glob patterns to include"),
      exclude: z
        .array(z.string())
        .optional()
        .describe("Glob patterns to exclude"),
    }),
  )
  .handle({
    async create({ input, artifacts }) {
      const matched = await tinyglob(input.include, {
        cwd: input.cwd,
        ...(input.exclude !== undefined ? { ignore: input.exclude } : {}),
        dot: true,
        onlyFiles: true,
      });

      const sorted = matched.sort();

      const files = await Promise.all(
        sorted.map(async (rel) => {
          const abs = path.join(input.cwd, rel);
          const raw = await fs.readFile(abs);
          const sha256 = crypto.createHash("sha256").update(raw).digest("hex");
          const stat = await fs.stat(abs);
          return { path: rel, sha256, size: stat.size };
        }),
      );

      // Create archive via temp file (tar doesn't support in-memory gzip well)
      const tmpPath = path.join(os.tmpdir(), `glob-${Date.now()}.tar.gz`);
      await tar.create({ gzip: true, file: tmpPath, cwd: input.cwd }, sorted);
      const archiveData = await fs.readFile(tmpPath);
      await fs.unlink(tmpPath);

      const archive = await artifacts.write("archive", archiveData);

      return { output: { archive, files, count: files.length } };
    },
  });
