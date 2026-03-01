import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { defineResource } from "@vyft/provider";
import * as tar from "tar";
import { glob as tinyglob } from "tinyglobby";
import { z } from "zod";

import { context } from "../context.ts";

export const glob = defineResource(
  {
    name: "glob",
    context,
    config: z.object({
      cwd: z.string(),
      include: z.array(z.string()),
      exclude: z.array(z.string()).optional(),
      format: z.enum(["tar.gz"]).optional(),
    }),
    outputs: z.object({
      path: z.string(),
      sha256: z.string(),
      size: z.number(),
      files: z.array(
        z.object({
          path: z.string(),
          sha256: z.string(),
          size: z.number(),
        }),
      ),
      count: z.number(),
    }),
  },
  {
    async create(id, config) {
      const matched = await tinyglob(config.include, {
        cwd: config.cwd,
        ...(config.exclude ? { ignore: config.exclude } : {}),
        dot: true,
        onlyFiles: true,
      });

      const sorted = matched.sort();

      const files = await Promise.all(
        sorted.map(async (rel) => {
          const abs = path.join(config.cwd, rel);
          const raw = await fs.readFile(abs);
          const sha256 = crypto.createHash("sha256").update(raw).digest("hex");
          const stat = await fs.stat(abs);
          return { path: rel, sha256, size: stat.size };
        }),
      );

      const archivePath = path.join(os.tmpdir(), `${id.internal}.tar.gz`);

      await tar.create(
        { gzip: true, file: archivePath, cwd: config.cwd },
        sorted,
      );

      const archiveRaw = await fs.readFile(archivePath);
      const sha256 = crypto
        .createHash("sha256")
        .update(archiveRaw)
        .digest("hex");
      const stat = await fs.stat(archivePath);

      return {
        outputs: {
          path: archivePath,
          sha256,
          size: stat.size,
          files,
          count: files.length,
        },
      };
    },

    async read() {
      return null;
    },
  },
);
