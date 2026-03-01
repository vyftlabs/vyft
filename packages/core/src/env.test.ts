import { deepStrictEqual, strictEqual } from "node:assert";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { loadEnv, parseEnv } from "./env.ts";

describe("parseEnv", () => {
  it("parses simple key=value", () => {
    deepStrictEqual(parseEnv("FOO=bar"), { FOO: "bar" });
  });

  it("parses double-quoted values", () => {
    deepStrictEqual(parseEnv('FOO="hello world"'), { FOO: "hello world" });
  });

  it("parses single-quoted values", () => {
    deepStrictEqual(parseEnv("FOO='hello world'"), { FOO: "hello world" });
  });

  it("ignores comments", () => {
    deepStrictEqual(parseEnv("# this is a comment\nFOO=bar"), { FOO: "bar" });
  });

  it("ignores empty lines", () => {
    deepStrictEqual(parseEnv("\n\nFOO=bar\n\n"), { FOO: "bar" });
  });

  it("handles export prefix", () => {
    deepStrictEqual(parseEnv("export FOO=bar"), { FOO: "bar" });
  });

  it("handles multiple entries", () => {
    deepStrictEqual(parseEnv("A=1\nB=2\nC=3"), { A: "1", B: "2", C: "3" });
  });

  it("handles values with equals signs", () => {
    deepStrictEqual(parseEnv("URL=postgres://host?opt=1"), {
      URL: "postgres://host?opt=1",
    });
  });

  it("handles empty values", () => {
    deepStrictEqual(parseEnv("EMPTY="), { EMPTY: "" });
  });

  it("skips lines without equals", () => {
    deepStrictEqual(parseEnv("NOEQ"), {});
  });

  it("handles mixed content", () => {
    const content = [
      "# database config",
      "DB_HOST=localhost",
      "DB_PORT=5432",
      "",
      "export DB_NAME=mydb",
      'DB_PASS="s3cret"',
    ].join("\n");
    deepStrictEqual(parseEnv(content), {
      DB_HOST: "localhost",
      DB_PORT: "5432",
      DB_NAME: "mydb",
      DB_PASS: "s3cret",
    });
  });
});

describe("loadEnv", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vyft-env-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true });
    // Clean up any env vars we set
    delete process.env["TEST_LOAD_ENV"];
    delete process.env["TEST_LOAD_ENV2"];
  });

  it("loads variables into process.env", async () => {
    await writeFile(join(dir, ".env"), "TEST_LOAD_ENV=hello");
    await loadEnv(dir);
    strictEqual(process.env["TEST_LOAD_ENV"], "hello");
  });

  it("does not override existing values", async () => {
    process.env["TEST_LOAD_ENV"] = "existing";
    await writeFile(join(dir, ".env"), "TEST_LOAD_ENV=new");
    await loadEnv(dir);
    strictEqual(process.env["TEST_LOAD_ENV"], "existing");
  });

  it("silently skips missing .env file", async () => {
    // Should not throw
    await loadEnv(dir);
  });

  it("loads multiple variables", async () => {
    await writeFile(join(dir, ".env"), "TEST_LOAD_ENV=a\nTEST_LOAD_ENV2=b");
    await loadEnv(dir);
    strictEqual(process.env["TEST_LOAD_ENV"], "a");
    strictEqual(process.env["TEST_LOAD_ENV2"], "b");
  });
});
