import crypto from "node:crypto";
import { defineResource } from "@vyft/provider";
import { z } from "zod";

import { context } from "../context.ts";

export const randomInteger = defineResource(
  {
    name: "randomInteger",
    context,
    config: z
      .object({
        min: z.number().int(),
        max: z.number().int(),
      })
      .refine((c) => c.min < c.max, {
        message: "min must be less than max",
      }),
    outputs: z.object({
      result: z.number(),
    }),
  },
  {
    async create(_id, config) {
      return { outputs: { result: crypto.randomInt(config.min, config.max) } };
    },

    async read() {
      return null;
    },
  },
);
