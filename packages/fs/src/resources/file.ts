import crypto from "node:crypto";
import fs from "node:fs/promises";
import { defineResource } from "@vyft/provider";
import { z } from "zod";

import { context } from "../context.ts";

export const file = defineResource(
  {
    name: "file",
    context,
    config: z.object({
      source: z.string(),
      encoding: z.enum(["utf-8", "base64"]).optional(),
    }),
    outputs: z.object({
      content: z.string(),
      sha256: z.string(),
      size: z.number(),
    }),
  },
  {
    async create(_id, config) {
      const raw = await fs.readFile(config.source);
      const encoding = config.encoding ?? "utf-8";
      const content = raw.toString(encoding);
      const sha256 = crypto.createHash("sha256").update(raw).digest("hex");
      const stat = await fs.stat(config.source);

      return { outputs: { content, sha256, size: stat.size } };
    },

    async read() {
      return null;
    },
  },
);
