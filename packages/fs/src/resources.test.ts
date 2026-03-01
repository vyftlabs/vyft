import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import { file } from "./resources/file.ts";
import { glob } from "./resources/glob.ts";
import { template } from "./resources/template.ts";

const id = { internal: "test-id" };
const ctx = {};

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

    const { outputs } = await file.handler.create(
      id,
      { source: filePath },
      ctx,
    );
    assert.equal(outputs.content, "hello world");
    assert.equal(outputs.size, 11);
    assert.equal(typeof outputs.sha256, "string");
    assert.equal(outputs.sha256.length, 64);
  });

  test("reads file as base64", async () => {
    const filePath = path.join(tmpDir, "binary.bin");
    const buf = Buffer.from([0x00, 0xff, 0x42]);
    await fs.writeFile(filePath, buf);

    const { outputs } = await file.handler.create(
      id,
      { source: filePath, encoding: "base64" },
      ctx,
    );
    assert.equal(outputs.content, buf.toString("base64"));
    assert.equal(outputs.size, 3);
  });

  test("sha256 is consistent for same content", async () => {
    const a = path.join(tmpDir, "a.txt");
    const b = path.join(tmpDir, "b.txt");
    await fs.writeFile(a, "same content");
    await fs.writeFile(b, "same content");

    const resA = await file.handler.create(id, { source: a }, ctx);
    const resB = await file.handler.create(id, { source: b }, ctx);
    assert.equal(resA.outputs.sha256, resB.outputs.sha256);
  });

  test("read returns null", async () => {
    const result = await file.handler.read?.(id, ctx);
    assert.equal(result, null);
  });
});

// ── template ────────────────────────────────────────────────────────────

describe("template", () => {
  test("interpolates inline content", async () => {
    const { outputs } = await template.handler.create(
      id,
      { content: "Hello, {{name}}!", vars: { name: "World" } },
      ctx,
    );
    assert.equal(outputs.content, "Hello, World!");
    assert.equal(typeof outputs.sha256, "string");
    assert.equal(outputs.sha256.length, 64);
  });

  test("interpolates from file source", async () => {
    const tplPath = path.join(tmpDir, "tpl.txt");
    await fs.writeFile(tplPath, "Hi {{user}}, welcome to {{place}}.");

    const { outputs } = await template.handler.create(
      id,
      { source: tplPath, vars: { user: "Alice", place: "Wonderland" } },
      ctx,
    );
    assert.equal(outputs.content, "Hi Alice, welcome to Wonderland.");
  });

  test("throws on undefined variable", async () => {
    await assert.rejects(
      () =>
        template.handler.create(id, { content: "{{missing}}", vars: {} }, ctx),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('"missing" not defined'));
        return true;
      },
    );
  });

  test("read returns null", async () => {
    const result = await template.handler.read?.(id, ctx);
    assert.equal(result, null);
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
    const { outputs } = await glob.handler.create(
      id,
      { cwd: globDir, include: ["*.txt"] },
      ctx,
    );
    assert.equal(outputs.count, 2);
    const paths = outputs.files.map((f) => f.path);
    assert.ok(paths.includes("a.txt"));
    assert.ok(paths.includes("b.txt"));
  });

  test("excludes files by pattern", async () => {
    const { outputs } = await glob.handler.create(
      id,
      { cwd: globDir, include: ["**/*"], exclude: ["*.log"] },
      ctx,
    );
    const paths = outputs.files.map((f) => f.path);
    assert.ok(!paths.includes("c.log"));
    assert.ok(paths.includes("a.txt"));
  });

  test("includes nested files with ** pattern", async () => {
    const { outputs } = await glob.handler.create(
      id,
      { cwd: globDir, include: ["**/*.txt"] },
      ctx,
    );
    assert.equal(outputs.count, 3);
    const paths = outputs.files.map((f) => f.path);
    assert.ok(paths.includes("sub/d.txt"));
  });

  test("per-file sha256 is correct", async () => {
    const { outputs } = await glob.handler.create(
      id,
      { cwd: globDir, include: ["a.txt"] },
      ctx,
    );
    assert.equal(outputs.count, 1);
    const f = outputs.files[0];
    assert.ok(f);
    assert.equal(f.path, "a.txt");
    assert.equal(f.size, 3);
    assert.equal(f.sha256.length, 64);
  });

  test("archive file exists on disk", async () => {
    const { outputs } = await glob.handler.create(
      id,
      { cwd: globDir, include: ["*.txt"] },
      ctx,
    );
    const stat = await fs.stat(outputs.path);
    assert.ok(stat.isFile());
    assert.equal(outputs.size, stat.size);
  });

  test("read returns null", async () => {
    const result = await glob.handler.read?.(id, ctx);
    assert.equal(result, null);
  });
});
