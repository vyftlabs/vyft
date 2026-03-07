import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { defineResource } from "@vyft/provider";
import { glob as tinyglob } from "tinyglobby";

export interface HashArgs {
  patterns: string | string[];
  cwd?: string;
}

export const hash = defineResource<HashArgs>("hash", {
  async create({ input }) {
    const cwd = input.cwd ?? process.cwd();
    const patterns = Array.isArray(input.patterns)
      ? input.patterns
      : [input.patterns];

    const matched = await tinyglob(patterns, {
      cwd,
      dot: true,
      onlyFiles: true,
    });

    const sorted = matched.sort();
    const hasher = crypto.createHash("sha256");

    for (const rel of sorted) {
      const abs = path.join(cwd, rel);
      hasher.update(rel);
      await new Promise<void>((resolve, reject) => {
        const stream = fs.createReadStream(abs);
        stream.on("data", (chunk) => hasher.update(chunk));
        stream.on("end", resolve);
        stream.on("error", reject);
      });
    }

    const checksum = hasher.digest("hex");

    return { output: { checksum, count: sorted.length } };
  },
});
