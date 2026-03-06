import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as tar from "tar";
import { glob as tinyglob } from "tinyglobby";
import { z } from "zod";
import { t } from "./provider.ts";

/**
 * Match files with glob patterns and create an archive.
 *
 * @example
 * ```ts
 * std.fs.glob({
 *   cwd: "./src",
 *   include: ["**\/*.ts"],
 *   exclude: ["**\/*.test.ts"]
 * })
 * ```
 */
export const glob = t
  .input(
    z.object({
      cwd: z.string().describe("Working directory for glob patterns"),
      include: z.array(z.string()).describe("Glob patterns to include"),
      exclude: z
        .array(z.string())
        .optional()
        .describe("Glob patterns to exclude"),
      oldCwd: z
        .string()
        .optional()
        .describe("Directory for old version (for diff)"),
    }),
  )
  .handle({
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

      // Create archive via temp file (tar doesn't support in-memory gzip well)
      const tmpPath = path.join(os.tmpdir(), `glob-${Date.now()}.tar.gz`);
      await tar.create({ gzip: true, file: tmpPath, cwd: input.cwd }, sorted);
      const archiveData = await fs.readFile(tmpPath);
      await fs.unlink(tmpPath);

      const archive = await ctx.artifacts.write("archive", archiveData);

      return { archive, files, count: files.length };
    },
    async read({ input }) {
      // Find all files matching the glob, just like in create
      const matched = await tinyglob(input.include, {
        cwd: input.cwd,
        ...(input.exclude !== undefined ? { ignore: input.exclude } : {}),
        dot: true,
        onlyFiles: true,
      });

      const sorted = matched.sort();

      // Gather file metadata
      const files = await Promise.all(
        sorted.map(async (rel) => {
          const abs = path.join(input.cwd, rel);
          const raw = await fs.readFile(abs);
          const sha256 = crypto.createHash("sha256").update(raw).digest("hex");
          const stat = await fs.stat(abs);
          return { path: rel, sha256, size: stat.size };
        }),
      );

      // Attempt to find existing archive by convention, or return artifact reference if your logic allows
      // For demo: just return the file info (this could be improved if you store archive references somewhere)
      return { files, count: files.length };
    },
    /**
     * Performs a per-line diff (like git) between files matching the glob in cwd (new) and oldCwd (old).
     * For each matching file, returns unified diff output.
     * Returns added, removed, and modified files.
     */
    async diff({ input }) {
      // Includes all files matching the include/exclude in both cwd (new) and oldCwd (old)
      const oldCwd = input.oldCwd ?? input.cwd; // fallback for diffing against the same folder
      const [oldMatched, newMatched] = await Promise.all([
        tinyglob(input.include, {
          cwd: oldCwd,
          ...(input.exclude !== undefined ? { ignore: input.exclude } : {}),
          dot: true,
          onlyFiles: true,
        }),
        tinyglob(input.include, {
          cwd: input.cwd,
          ...(input.exclude !== undefined ? { ignore: input.exclude } : {}),
          dot: true,
          onlyFiles: true,
        }),
      ]);
      const oldSet = new Set(oldMatched);
      const newSet = new Set(newMatched);

      // All affected files (union)
      const allFiles = Array.from(
        new Set([...oldMatched, ...newMatched]),
      ).sort();

      // Helper: compute unified diff per file
      function unifiedDiff(
        oldLines: string[],
        newLines: string[],
        file: string,
      ) {
        // Simple LCS-based diff for unified patch output (like git)
        // (This is not a full patch implementation, but enough for readable per-line changes.)

        // LCS matrix
        const m = oldLines.length,
          n = newLines.length;
        const dp: number[][] = Array(m + 1)
          .fill(0)
          .map(() => Array(n + 1).fill(0));
        for (let i = m - 1; i >= 0; i--) {
          for (let j = n - 1; j >= 0; j--) {
            if (oldLines[i] === newLines[j]) dp[i][j] = 1 + dp[i + 1][j + 1];
            else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
          }
        }

        // Reconstruct diff hunks
        const diffs: { type: "equal" | "add" | "del"; value: string }[] = [];
        let i = 0,
          j = 0;
        while (i < m && j < n) {
          if (oldLines[i] === newLines[j]) {
            diffs.push({ type: "equal", value: oldLines[i] });
            i++;
            j++;
          } else if (dp[i + 1][j] >= dp[i][j + 1]) {
            diffs.push({ type: "del", value: oldLines[i] });
            i++;
          } else {
            diffs.push({ type: "add", value: newLines[j] });
            j++;
          }
        }
        while (i < m) {
          diffs.push({ type: "del", value: oldLines[i] });
          i++;
        }
        while (j < n) {
          diffs.push({ type: "add", value: newLines[j] });
          j++;
        }

        // Format as unified diff string
        const header = `--- a/${file}\n+++ b/${file}\n`;
        const out: string[] = [header];
        let oldLine = 1,
          newLine = 1;
        let hunkLines: string[] = [];
        let hunkStartOld = 0,
          hunkLenOld = 0,
          hunkStartNew = 0,
          hunkLenNew = 0;
        let insideHunk = false;

        function flushHunk() {
          if (hunkLines.length === 0) return;
          // Calculating hunk header
          const oldStart = hunkStartOld + 1;
          const newStart = hunkStartNew + 1;
          const hunkHeader = `@@ -${oldStart},${hunkLenOld} +${newStart},${hunkLenNew} @@\n`;
          out.push(hunkHeader, ...hunkLines);
          hunkLines = [];
          insideHunk = false;
        }

        for (let k = 0; k < diffs.length; k++) {
          const d = diffs[k];
          if (d.type === "equal") {
            if (insideHunk && hunkLines.length > 0 && hunkLines.length >= 3) {
              flushHunk();
            }
            if (
              !insideHunk &&
              k + 1 < diffs.length &&
              (diffs[k + 1].type === "del" || diffs[k + 1].type === "add")
            ) {
              // Begin hunk
              hunkStartOld = oldLine - 1;
              hunkStartNew = newLine - 1;
              hunkLenOld = 0;
              hunkLenNew = 0;
              insideHunk = true;
            }
            if (insideHunk) {
              hunkLines.push(` ${d.value}`);
              hunkLenOld++;
              hunkLenNew++;
            }
            oldLine++;
            newLine++;
          } else if (d.type === "add") {
            if (!insideHunk) {
              hunkStartOld = oldLine - 1;
              hunkStartNew = newLine - 1;
              hunkLenOld = 0;
              hunkLenNew = 0;
              insideHunk = true;
            }
            hunkLines.push(`+${d.value}`);
            hunkLenNew++;
            newLine++;
          } else if (d.type === "del") {
            if (!insideHunk) {
              hunkStartOld = oldLine - 1;
              hunkStartNew = newLine - 1;
              hunkLenOld = 0;
              hunkLenNew = 0;
              insideHunk = true;
            }
            hunkLines.push(`-${d.value}`);
            hunkLenOld++;
            oldLine++;
          }
        }
        // flush tail hunk
        flushHunk();
        return out.join("");
      }

      type DiffFile = {
        path: string;
        type: "added" | "removed" | "modified";
        diff?: string;
      };

      const result: DiffFile[] = [];
      for (const file of allFiles) {
        const inOld = oldSet.has(file);
        const inNew = newSet.has(file);

        if (inOld && !inNew) {
          // Removed file
          result.push({ path: file, type: "removed" });
        } else if (!inOld && inNew) {
          // Added file
          result.push({ path: file, type: "added" });
        } else if (inOld && inNew) {
          // Compare contents
          const [oldBuf, newBuf] = await Promise.all([
            fs.readFile(path.join(oldCwd, file)).catch(() => Buffer.from("")),
            fs
              .readFile(path.join(input.cwd, file))
              .catch(() => Buffer.from("")),
          ]);
          if (oldBuf.equals(newBuf)) {
            continue; // No change
          }
          // Diff per line (as in git)
          const oldText = oldBuf.toString("utf8").replace(/\r\n/g, "\n");
          const newText = newBuf.toString("utf8").replace(/\r\n/g, "\n");
          const oldLines = oldText.split("\n");
          const newLines = newText.split("\n");

          // Remove last empty line if file ends with newline (git diff does this)
          if (oldLines.length > 0 && oldLines[oldLines.length - 1] === "")
            oldLines.pop();
          if (newLines.length > 0 && newLines[newLines.length - 1] === "")
            newLines.pop();

          const diff = unifiedDiff(oldLines, newLines, file);

          result.push({ path: file, type: "modified", diff });
        }
      }

      return { files: result, count: result.length };
    },
  });
