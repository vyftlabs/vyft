import crypto from "node:crypto";
import { defineResource } from "@vyft/provider";
import { z } from "zod";

import { context } from "../context.ts";

const LOWER = "abcdefghijklmnopqrstuvwxyz";
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const NUMERIC = "0123456789";
const SPECIAL = "!@#$%^&*()-_=+[]{}|;:',.<>?/`~";

export const randomString = defineResource(
  {
    name: "randomString",
    context,
    config: z.object({
      length: z.number().int().min(1),
      alphabet: z.string().min(1).optional(),
      special: z.boolean().optional(),
      upper: z.boolean().optional(),
      lower: z.boolean().optional(),
      numeric: z.boolean().optional(),
    }),
    outputs: z.object({
      result: z.string(),
    }),
  },
  {
    async create(_id, config) {
      let alphabet = config.alphabet;

      if (!alphabet) {
        const hasExplicitFlag =
          config.lower !== undefined ||
          config.upper !== undefined ||
          config.numeric !== undefined ||
          config.special !== undefined;

        let chars = "";
        if (!hasExplicitFlag) {
          chars = LOWER + UPPER + NUMERIC;
        } else {
          if (config.lower) chars += LOWER;
          if (config.upper) chars += UPPER;
          if (config.numeric) chars += NUMERIC;
          if (config.special) chars += SPECIAL;
        }

        if (chars.length === 0) {
          throw new Error(
            "randomString: at least one character class must be enabled",
          );
        }

        alphabet = chars;
      }

      let result = "";
      for (let i = 0; i < config.length; i++) {
        result += alphabet[crypto.randomInt(alphabet.length)];
      }

      return { outputs: { result } };
    },

    async read() {
      return null;
    },
  },
);
