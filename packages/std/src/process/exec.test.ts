import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import type { ArtifactRef, Artifacts } from "@vyft/core";

import { exec } from "./exec.ts";

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

let tmpDir: string;

before(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "vyft-exec-test-"));
});

after(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function assertArtifactRef(value: unknown, expectedKey: string): void {
  assert.ok(value != null && typeof value === "object" && "key" in value);
  assert.equal(value.key, expectedKey);
}

const create = exec.handlers.create;
assert.ok(create);

describe("exec", () => {
  describe("basic command execution", () => {
    test("executes simple command and returns stdout artifact", async () => {
      const result = await create({
        input: { command: ["echo", "hello"] },
        ctx: { artifacts: createMockArtifacts() },
      });
      const output = result.output as Record<string, unknown>;

      assertArtifactRef(output["stdout"], "stdout");
    });

    test("executes command with multiple arguments", async () => {
      const result = await create({
        input: { command: ["printf", "%s %s", "hello", "world"] },
        ctx: { artifacts: createMockArtifacts() },
      });
      const output = result.output as Record<string, unknown>;

      assertArtifactRef(output["stdout"], "stdout");
    });

    test("returns stderr artifact", async () => {
      const result = await create({
        input: {
          command: ["sh", "-c", "echo warn >&2; echo ok"],
        },
        ctx: { artifacts: createMockArtifacts() },
      });
      const output = result.output as Record<string, unknown>;

      assertArtifactRef(output["stderr"], "stderr");
    });
  });

  describe("stdin", () => {
    test("accepts literal string stdin", async () => {
      const result = await create({
        input: {
          command: ["wc", "-c"],
          stdin: "hello",
        },
        ctx: { artifacts: createMockArtifacts() },
      });
      const output = result.output as Record<string, unknown>;

      assertArtifactRef(output["stdout"], "stdout");
    });

    test("accepts file path via stdinFile", async () => {
      const inputFile = path.join(tmpDir, "stdin-test.txt");
      await fs.writeFile(inputFile, "file content here");

      const result = await create({
        input: {
          command: ["wc", "-c"],
          stdinFile: inputFile,
        },
        ctx: { artifacts: createMockArtifacts() },
      });
      const output = result.output as Record<string, unknown>;

      assertArtifactRef(output["stdout"], "stdout");
    });

    test("accepts relative file path with cwd", async () => {
      await fs.writeFile(path.join(tmpDir, "relative.txt"), "relative content");

      const result = await create({
        input: {
          command: ["cat"],
          stdinFile: "./relative.txt",
          cwd: tmpDir,
        },
        ctx: { artifacts: createMockArtifacts() },
      });
      const output = result.output as Record<string, unknown>;

      assertArtifactRef(output["stdout"], "stdout");
    });

    test("throws when stdinFile does not exist", async () => {
      await assert.rejects(async () => {
        await create({
          input: {
            command: ["cat"],
            stdinFile: "./nonexistent.txt",
            cwd: tmpDir,
          },
          ctx: { artifacts: createMockArtifacts() },
        });
      });
    });

    test("throws when both stdin and stdinFile are specified", async () => {
      await assert.rejects(
        async () => {
          await create({
            input: {
              command: ["cat"],
              stdin: "literal",
              stdinFile: "./file.txt",
            },
            ctx: { artifacts: createMockArtifacts() },
          });
        },
        (err: Error) => {
          assert.ok(err.message.includes("Cannot specify both"));
          return true;
        },
      );
    });
  });

  describe("environment variables", () => {
    test("sets custom environment variables", async () => {
      const result = await create({
        input: {
          command: ["sh", "-c", "echo $MY_CUSTOM_VAR"],
          env: { MY_CUSTOM_VAR: "test_value" },
        },
        ctx: { artifacts: createMockArtifacts() },
      });
      const output = result.output as Record<string, unknown>;

      assertArtifactRef(output["stdout"], "stdout");
    });
  });

  describe("working directory", () => {
    test("executes in specified directory", async () => {
      await fs.writeFile(path.join(tmpDir, "cwd-test.txt"), "exists");

      const result = await create({
        input: {
          command: ["ls", "cwd-test.txt"],
          cwd: tmpDir,
        },
        ctx: { artifacts: createMockArtifacts() },
      });
      const output = result.output as Record<string, unknown>;

      assertArtifactRef(output["stdout"], "stdout");
    });

    test("fails when file not in cwd", async () => {
      const otherDir = path.join(tmpDir, "other");
      await fs.mkdir(otherDir);
      await fs.writeFile(path.join(tmpDir, "not-here.txt"), "content");

      await assert.rejects(async () => {
        await create({
          input: {
            command: ["ls", "not-here.txt"],
            cwd: otherDir,
          },
          ctx: { artifacts: createMockArtifacts() },
        });
      });
    });
  });

  describe("timeout", () => {
    test("kills command after timeout", async () => {
      await assert.rejects(
        async () => {
          await create({
            input: {
              command: ["sleep", "10"],
              timeout: 100,
            },
            ctx: { artifacts: createMockArtifacts() },
          });
        },
        (err: Error) => {
          assert.ok(err.message.includes("timed out"));
          return true;
        },
      );
    });

    test("succeeds when command finishes before timeout", async () => {
      const result = await create({
        input: {
          command: ["echo", "fast"],
          timeout: 5000,
        },
        ctx: { artifacts: createMockArtifacts() },
      });
      const output = result.output as Record<string, unknown>;

      assertArtifactRef(output["stdout"], "stdout");
    });
  });

  describe("error handling", () => {
    test("throws on non-zero exit code", async () => {
      await assert.rejects(
        async () => {
          await create({
            input: { command: ["sh", "-c", "exit 1"] },
            ctx: { artifacts: createMockArtifacts() },
          });
        },
        (err: Error) => {
          assert.ok(err.message.includes("exit code 1"));
          return true;
        },
      );
    });

    test("throws on command not found", async () => {
      await assert.rejects(async () => {
        await create({
          input: { command: ["this-command-does-not-exist-xyz"] },
          ctx: { artifacts: createMockArtifacts() },
        });
      });
    });

    test("includes stderr in error for failed commands", async () => {
      await assert.rejects(
        async () => {
          await create({
            input: {
              command: ["sh", "-c", "echo 'error message' >&2; exit 1"],
            },
            ctx: { artifacts: createMockArtifacts() },
          });
        },
        (err: Error) => {
          assert.ok(err.message.includes("error message"));
          return true;
        },
      );
    });
  });
});
