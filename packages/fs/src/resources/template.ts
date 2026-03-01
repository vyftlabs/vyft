import crypto from "node:crypto";
import fs from "node:fs/promises";
import { defineResource } from "@vyft/provider";
import Handlebars from "handlebars";
import { z } from "zod";

import { context } from "../context.ts";

export const template = defineResource(
  {
    name: "template",
    context,
    config: z
      .object({
        source: z.string().optional(),
        content: z.string().optional(),
        vars: z.record(z.string(), z.string()),
      })
      .refine((c) => (c.source != null) !== (c.content != null), {
        message: "Exactly one of 'source' or 'content' must be provided",
      }),
    outputs: z.object({
      content: z.string(),
      sha256: z.string(),
    }),
  },
  {
    async create(_id, config) {
      const raw = config.source
        ? await fs.readFile(config.source, "utf-8")
        : (config.content as string);

      const compile = Handlebars.compile(raw, { strict: true });
      const rendered = compile(config.vars);

      const sha256 = crypto.createHash("sha256").update(rendered).digest("hex");

      return { outputs: { content: rendered, sha256 } };
    },

    async read() {
      return null;
    },
  },
);
