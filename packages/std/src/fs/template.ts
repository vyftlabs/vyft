import crypto from "node:crypto";
import fs from "node:fs/promises";
import { defineResource } from "@vyft/provider";
import Handlebars from "handlebars";

export interface TemplateArgs {
  source?: string;
  content?: string;
  vars: Record<string, string>;
}

export interface TemplateOutputs {
  content: string;
  sha256: string;
}

export const template = defineResource<TemplateArgs, TemplateOutputs>(
  "template",
  {
    async create({ input }) {
      if ((input.source != null) === (input.content != null)) {
        throw new Error(
          "Exactly one of 'source' or 'content' must be provided",
        );
      }

      const raw = input.source
        ? await fs.readFile(input.source, "utf-8")
        : (input.content as string);

      const compile = Handlebars.compile(raw, { strict: true });
      const rendered = compile(input.vars);

      const sha256 = crypto.createHash("sha256").update(rendered).digest("hex");

      return { output: { content: rendered, sha256 } };
    },
  },
);
