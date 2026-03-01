import crypto from "node:crypto";
import { defineResource } from "@vyft/provider";
import { z } from "zod";

import { context } from "../context.ts";

export const randomUuid = defineResource(
  {
    name: "randomUuid",
    context,
    config: z.object({}),
    outputs: z.object({
      result: z.string(),
    }),
  },
  {
    async create() {
      return { outputs: { result: crypto.randomUUID() } };
    },

    async read() {
      return null;
    },
  },
);
