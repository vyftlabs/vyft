import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import type { ArtifactRef, ArtifactStore } from "@vyft/provider";

import { file, glob, template } from "./index.ts";

const id = { internal: "test-id" };

function createMockArtifactStore(): ArtifactStore {
  const artifacts = new Map<string, Buffer>();
  const registered = new Map<string, ArtifactRef>();

  return {
    async write(key: string, content: string | Buffer): Promise<ArtifactRef> {
      const buf = typeof content === "string" ? Buffer.from(content) : content;
      const hash = `mock-hash-${key}`;
      artifacts.set(hash, buf);
      const ref: ArtifactRef = {
        kind: "artifact",
        key,
        hash,
        size: buf.length,
      };
      registered.set(key, ref);
      return ref;
    },
    async read(ref: ArtifactRef): Promise<Buffer> {
      const buf = artifacts.get(ref.hash);
      if (!buf) throw new Error("Artifact not found");
      return buf;
    },
    async exists(ref: ArtifactRef): Promise<boolean> {
      return artifacts.has(ref.hash);
    },
    async delete(ref: ArtifactRef): Promise<void> {
      artifacts.delete(ref.hash);
    },
    async deleteAll(): Promise<void> {
      artifacts.clear();
    },
    getRegistered(): Map<string, ArtifactRef> {
      return registered;
    },
  };
}

// biome-ignore lint/suspicious/noExplicitAny: test helper
function createCtx(): any {
  return {
    artifacts: createMockArtifactStore(),
    meta: { resourceId: "test-id", resourceName: "test" },
  };
}

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

    const result = await file.handler.create({
      id,
      input: { source: filePath },
      ctx: createCtx(),
    });
    const output = "output" in result ? result.output : result;
    assert.equal(output.content, "hello world");
    assert.equal(output.size, 11);
    assert.equal(typeof output.sha256, "string");
    assert.equal(output.sha256.length, 64);
  });

  test("reads file as base64", async () => {
    const filePath = path.join(tmpDir, "binary.bin");
    const buf = Buffer.from([0x00, 0xff, 0x42]);
    await fs.writeFile(filePath, buf);

    const result = await file.handler.create({
      id,
      input: { source: filePath, encoding: "base64" },
      ctx: createCtx(),
    });
    const output = "output" in result ? result.output : result;
    assert.equal(output.content, buf.toString("base64"));
    assert.equal(output.size, 3);
  });

  test("sha256 is consistent for same content", async () => {
    const a = path.join(tmpDir, "a.txt");
    const b = path.join(tmpDir, "b.txt");
    await fs.writeFile(a, "same content");
    await fs.writeFile(b, "same content");

    const resA = await file.handler.create({
      id,
      input: { source: a },
      ctx: createCtx(),
    });
    const resB = await file.handler.create({
      id,
      input: { source: b },
      ctx: createCtx(),
    });
    const outputA = "output" in resA ? resA.output : resA;
    const outputB = "output" in resB ? resB.output : resB;
    assert.equal(outputA.sha256, outputB.sha256);
  });
});

// ── template ────────────────────────────────────────────────────────────

describe("template", () => {
  test("interpolates inline content", async () => {
    const result = await template.handler.create({
      id,
      input: { content: "Hello, {{name}}!", vars: { name: "World" } },
      ctx: createCtx(),
    });
    const output = "output" in result ? result.output : result;
    assert.equal(output.content, "Hello, World!");
    assert.equal(typeof output.sha256, "string");
    assert.equal(output.sha256.length, 64);
  });

  test("interpolates from file source", async () => {
    const tplPath = path.join(tmpDir, "tpl.txt");
    await fs.writeFile(tplPath, "Hi {{user}}, welcome to {{place}}.");

    const result = await template.handler.create({
      id,
      input: { source: tplPath, vars: { user: "Alice", place: "Wonderland" } },
      ctx: createCtx(),
    });
    const output = "output" in result ? result.output : result;
    assert.equal(output.content, "Hi Alice, welcome to Wonderland.");
  });

  test("throws on undefined variable", async () => {
    await assert.rejects(
      async () => {
        await template.handler.create({
          id,
          input: { content: "{{missing}}", vars: {} },
          ctx: createCtx(),
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('"missing" not defined'));
        return true;
      },
    );
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
    const result = await glob.handler.create({
      id,
      input: { cwd: globDir, include: ["*.txt"] },
      ctx: createCtx(),
    });
    const output = "output" in result ? result.output : result;
    assert.equal(output.count, 2);
    const paths = output.files.map((f: { path: string }) => f.path);
    assert.ok(paths.includes("a.txt"));
    assert.ok(paths.includes("b.txt"));
  });

  test("excludes files by pattern", async () => {
    const result = await glob.handler.create({
      id,
      input: { cwd: globDir, include: ["**/*"], exclude: ["*.log"] },
      ctx: createCtx(),
    });
    const output = "output" in result ? result.output : result;
    const paths = output.files.map((f: { path: string }) => f.path);
    assert.ok(!paths.includes("c.log"));
    assert.ok(paths.includes("a.txt"));
  });

  test("includes nested files with ** pattern", async () => {
    const result = await glob.handler.create({
      id,
      input: { cwd: globDir, include: ["**/*.txt"] },
      ctx: createCtx(),
    });
    const output = "output" in result ? result.output : result;
    assert.equal(output.count, 3);
    const paths = output.files.map((f: { path: string }) => f.path);
    assert.ok(paths.includes("sub/d.txt"));
  });

  test("per-file sha256 is correct", async () => {
    const result = await glob.handler.create({
      id,
      input: { cwd: globDir, include: ["a.txt"] },
      ctx: createCtx(),
    });
    const output = "output" in result ? result.output : result;
    assert.equal(output.count, 1);
    const f = output.files[0];
    assert.ok(f);
    assert.equal(f.path, "a.txt");
    assert.equal(f.size, 3);
    assert.equal(f.sha256.length, 64);
  });

  test("returns archive artifact ref", async () => {
    const result = await glob.handler.create({
      id,
      input: { cwd: globDir, include: ["*.txt"] },
      ctx: createCtx(),
    });
    const output = "output" in result ? result.output : result;
    assert.equal(output.archive.kind, "artifact");
    assert.equal(output.archive.key, "archive");
    assert.ok(output.archive.size > 0);
  });
});
