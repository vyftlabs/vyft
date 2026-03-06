import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import type { ArtifactRef, Artifacts } from "@vyft/core";

import { file, glob, template } from "./index.ts";

function createMockArtifacts(): Artifacts {
  const store = new Map<string, Buffer>();

  return {
    async write(name: string, data: string | Buffer): Promise<ArtifactRef> {
      const buf = typeof data === "string" ? Buffer.from(data) : data;
      store.set(name, buf);
      return { key: name };
    },
    async read(ref: ArtifactRef): Promise<Buffer> {
      const buf = store.get(ref.key);
      if (!buf) throw new Error("Artifact not found");
      return buf;
    },
    async exists(ref: ArtifactRef): Promise<boolean> {
      return store.has(ref.key);
    },
    async delete(ref: ArtifactRef): Promise<void> {
      store.delete(ref.key);
    },
  };
}

const ctx = {} as never;

let tmpDir: string;

before(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "vyft-fs-test-"));
});

after(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ── file ────────────────────────────────────────────────────────────────

describe("file", () => {
  test("reads file as utf-8 by default", async () => {
    const filePath = path.join(tmpDir, "hello.txt");
    await fs.writeFile(filePath, "hello world");

    const input = { source: filePath };
    const result = (await file.handlers.create?.({
      input,
      ctx,
      artifacts: createMockArtifacts(),
    })) as { content: string; size: number; sha256: string };
    assert.equal(result.content, "hello world");
    assert.equal(result.size, 11);
    assert.equal(typeof result.sha256, "string");
    assert.equal(result.sha256.length, 64);
  });

  test("reads file as base64", async () => {
    const filePath = path.join(tmpDir, "binary.bin");
    const buf = Buffer.from([0x00, 0xff, 0x42]);
    await fs.writeFile(filePath, buf);

    const input = { source: filePath, encoding: "base64" } as const;
    const result = (await file.handlers.create?.({
      input,
      ctx,
      artifacts: createMockArtifacts(),
    })) as { content: string; size: number };
    assert.equal(result.content, buf.toString("base64"));
    assert.equal(result.size, 3);
  });

  test("sha256 is consistent for same content", async () => {
    const a = path.join(tmpDir, "a.txt");
    const b = path.join(tmpDir, "b.txt");
    await fs.writeFile(a, "same content");
    await fs.writeFile(b, "same content");

    const resA = (await file.handlers.create?.({
      input: { source: a },
      ctx,
      artifacts: createMockArtifacts(),
    })) as { sha256: string };
    const resB = (await file.handlers.create?.({
      input: { source: b },
      ctx,
      artifacts: createMockArtifacts(),
    })) as { sha256: string };
    assert.equal(resA.sha256, resB.sha256);
  });
});

// ── template ────────────────────────────────────────────────────────────

describe("template", () => {
  test("interpolates inline content", async () => {
    const input = { content: "Hello, {{name}}!", vars: { name: "World" } };
    const result = (await template.handlers.create?.({
      input,
      ctx,
      artifacts: createMockArtifacts(),
    })) as { content: string; sha256: string };
    assert.equal(result.content, "Hello, World!");
    assert.equal(typeof result.sha256, "string");
    assert.equal(result.sha256.length, 64);
  });

  test("interpolates from file source", async () => {
    const tplPath = path.join(tmpDir, "tpl.txt");
    await fs.writeFile(tplPath, "Hi {{user}}, welcome to {{place}}.");

    const input = {
      source: tplPath,
      vars: { user: "Alice", place: "Wonderland" },
    };
    const result = (await template.handlers.create?.({
      input,
      ctx,
      artifacts: createMockArtifacts(),
    })) as { content: string };
    assert.equal(result.content, "Hi Alice, welcome to Wonderland.");
  });

  test("throws on undefined variable", async () => {
    const input = { content: "{{missing}}", vars: {} };
    await assert.rejects(async () => {
      await template.handlers.create?.({
        input,
        ctx,
        artifacts: createMockArtifacts(),
      });
    });
  });
});

// ── glob ────────────────────────────────────────────────────────────────

describe("glob", () => {
  let globDir: string;

  before(async () => {
    globDir = path.join(tmpDir, "glob-test");
    await fs.mkdir(globDir, { recursive: true });
    await fs.mkdir(path.join(globDir, "sub"), { recursive: true });
    await fs.writeFile(path.join(globDir, "a.txt"), "aaa");
    await fs.writeFile(path.join(globDir, "b.txt"), "bbb");
    await fs.writeFile(path.join(globDir, "c.log"), "ccc");
    await fs.writeFile(path.join(globDir, "sub", "d.txt"), "ddd");
  });

  test("matches files by pattern", async () => {
    const input = { cwd: globDir, include: ["*.txt"] };
    const result = (await glob.handlers.create?.({
      input,
      ctx,
      artifacts: createMockArtifacts(),
    })) as { count: number; files: { path: string }[] };
    assert.equal(result.count, 2);
    const paths = result.files.map((f) => f.path);
    assert.ok(paths.includes("a.txt"));
    assert.ok(paths.includes("b.txt"));
  });

  test("excludes files by pattern", async () => {
    const input = { cwd: globDir, include: ["**/*"], exclude: ["*.log"] };
    const result = (await glob.handlers.create?.({
      input,
      ctx,
      artifacts: createMockArtifacts(),
    })) as { files: { path: string }[] };
    const paths = result.files.map((f) => f.path);
    assert.ok(!paths.includes("c.log"));
    assert.ok(paths.includes("a.txt"));
  });

  test("includes nested files with ** pattern", async () => {
    const input = { cwd: globDir, include: ["**/*.txt"] };
    const result = (await glob.handlers.create?.({
      input,
      ctx,
      artifacts: createMockArtifacts(),
    })) as { count: number; files: { path: string }[] };
    assert.equal(result.count, 3);
    const paths = result.files.map((f) => f.path);
    assert.ok(paths.includes("sub/d.txt"));
  });

  test("per-file sha256 is correct", async () => {
    const input = { cwd: globDir, include: ["a.txt"] };
    const result = (await glob.handlers.create?.({
      input,
      ctx,
      artifacts: createMockArtifacts(),
    })) as {
      count: number;
      files: { path: string; size: number; sha256: string }[];
    };
    assert.equal(result.count, 1);
    const f = result.files[0];
    assert.ok(f);
    assert.equal(f.path, "a.txt");
    assert.equal(f.size, 3);
    assert.equal(f.sha256.length, 64);
  });

  test("returns archive artifact ref", async () => {
    const input = { cwd: globDir, include: ["*.txt"] };
    const result = (await glob.handlers.create?.({
      input,
      ctx,
      artifacts: createMockArtifacts(),
    })) as { archive: ArtifactRef };
    assert.equal(result.archive.key, "archive");
  });
});
