import crypto from "node:crypto";
import fs from "node:fs/promises";
import Handlebars from "handlebars";
import { z } from "zod";
import { t } from "../provider.ts";

/**
 * Render a Handlebars template with variables.
 *
 * @example
 * ```ts
 * // From file
 * std.fs.template({
 *   source: "./nginx.conf.tpl",
 *   vars: { port: "8080", host: "localhost" }
 * })
 *
 * // Inline content
 * std.fs.template({
 *   content: "Hello, {{name}}!",
 *   vars: { name: "World" }
 * })
 * ```
 */
export const template = t.resource
  .input(
    z
      .object({
        source: z.string().optional().describe("Path to template file"),
        content: z.string().optional().describe("Inline template content"),
        vars: z
          .record(z.string(), z.string())
          .describe("Variables to substitute"),
      })
      .refine((c) => (c.source != null) !== (c.content != null), {
        message: "Exactly one of 'source' or 'content' must be provided",
      }),
  )
  .handle({
    async create({ input }) {
      const raw = input.source
        ? await fs.readFile(input.source, "utf-8")
        : (input.content as string);

      const compile = Handlebars.compile(raw, { strict: true });
      const rendered = compile(input.vars);

      const sha256 = crypto.createHash("sha256").update(rendered).digest("hex");

      return { output: { content: rendered, sha256 } };
    },
  });
