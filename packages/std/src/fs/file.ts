import crypto from "node:crypto";
import fs from "node:fs/promises";
import { defineResource } from "@vyft/provider";

export interface FileArgs {
  source: string;
  encoding?: "utf-8" | "base64";
}

export const file = defineResource<FileArgs>("file", {
  async create({ input }) {
    const raw = await fs.readFile(input.source);
    const encoding = input.encoding ?? "utf-8";
    const content = raw.toString(encoding);
    const sha256 = crypto.createHash("sha256").update(raw).digest("hex");
    const stat = await fs.stat(input.source);

    return { output: { content, sha256, size: stat.size } };
  },
});
