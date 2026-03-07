import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { defineResource } from "@vyft/provider";
import * as tar from "tar";
import { glob as tinyglob } from "tinyglobby";

export interface GlobArgs {
  cwd: string;
  include: string[];
  exclude?: string[];
  oldCwd?: string;
}

export const glob = defineResource<GlobArgs>("glob", {
  async create({ input, ctx }) {
    const matched = await tinyglob(input.include, {
      cwd: input.cwd,
      ...(input.exclude !== undefined ? { ignore: input.exclude } : {}),
      dot: true,
      onlyFiles: true,
    });

    const sorted = matched.sort();

    const files = await Promise.all(
      sorted.map(async (rel) => {
        const abs = path.join(input.cwd, rel);
        const raw = await fs.readFile(abs);
        const sha256 = crypto.createHash("sha256").update(raw).digest("hex");
        const stat = await fs.stat(abs);
        return { path: rel, sha256, size: stat.size };
      }),
    );

    const tmpPath = path.join(os.tmpdir(), `glob-${Date.now()}.tar.gz`);
    await tar.create({ gzip: true, file: tmpPath, cwd: input.cwd }, sorted);
    const archiveData = await fs.readFile(tmpPath);
    await fs.unlink(tmpPath);

    const archive = await ctx.artifacts.write("archive", archiveData);

    return { output: { archive, files, count: files.length } };
  },
});
