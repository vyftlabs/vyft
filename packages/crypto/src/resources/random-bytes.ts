import crypto from "node:crypto";
import { defineResource } from "@vyft/provider";
import { z } from "zod";

import { context } from "../context.ts";

export const randomBytes = defineResource(
  {
    name: "randomBytes",
    context,
    config: z.object({
      length: z.number().int().min(1),
      encoding: z.enum(["hex", "base64"]).optional(),
    }),
    outputs: z.object({
      result: z.string(),
    }),
  },
  {
    async create(_id, config) {
      const encoding = config.encoding ?? "hex";
      const result = crypto.randomBytes(config.length).toString(encoding);
      return { outputs: { result } };
    },

    async read() {
      return null;
    },
  },
);
