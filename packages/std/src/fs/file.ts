import crypto from "node:crypto";
import fs from "node:fs/promises";
import { z } from "zod";
import { t } from "../provider.ts";

/**
 * Read a file and return its content with metadata.
 *
 * @example
 * ```ts
 * std.fs.file({ source: "./config.json" })
 * std.fs.file({ source: "./image.png", encoding: "base64" })
 * ```
 */
export const file = t.resource
  .input(
    z.object({
      source: z.string().describe("Path to the file to read"),
      encoding: z
        .enum(["utf-8", "base64"])
        .optional()
        .describe("Output encoding"),
    }),
  )
  .handle({
    async create({ input }) {
      const raw = await fs.readFile(input.source);
      const encoding = input.encoding ?? "utf-8";
      const content = raw.toString(encoding);
      const sha256 = crypto.createHash("sha256").update(raw).digest("hex");
      const stat = await fs.stat(input.source);

      return { content, sha256, size: stat.size };
    },
  });
