import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { testResource } from "@vyft/provider/testing";

import { exec } from "./exec.ts";

let tmpDir: string;

before(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "vyft-exec-test-"));
});

after(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("exec", () => {
  describe("basic command execution", () => {
    test("executes simple command and returns stdout artifact", async () => {
      const { output } = await testResource(exec).create({
        input: { command: ["echo", "hello"] },
      });

      assert.equal(output.stdout.kind, "artifact");
      assert.equal(output.stdout.key, "stdout");
      assert.ok(output.stdout.size > 0);
    });

    test("executes command with multiple arguments", async () => {
      const { output } = await testResource(exec).create({
        input: { command: ["printf", "%s %s", "hello", "world"] },
      });

      assert.ok(output.stdout.size > 0);
    });

    test("returns artifact with correct size", async () => {
      const { output } = await testResource(exec).create({
        input: { command: ["echo", "-n", "12345"] },
      });

      assert.equal(output.stdout.size, 5);
    });

    test("returns stderr artifact", async () => {
      const { output } = await testResource(exec).create({
        input: {
          command: ["sh", "-c", "echo warn >&2; echo ok"],
        },
      });

      assert.equal(output.stderr.kind, "artifact");
      assert.equal(output.stderr.key, "stderr");
      assert.ok(output.stderr.size > 0);
    });
  });

  describe("stdin", () => {
    test("accepts literal string stdin", async () => {
      const { output } = await testResource(exec).create({
        input: {
          command: ["wc", "-c"],
          stdin: "hello",
        },
      });

      assert.ok(output.stdout.size > 0);
    });

    test("accepts file path via stdinFile", async () => {
      const inputFile = path.join(tmpDir, "stdin-test.txt");
      await fs.writeFile(inputFile, "file content here");

      const { output } = await testResource(exec).create({
        input: {
          command: ["wc", "-c"],
          stdinFile: inputFile,
        },
      });

      assert.ok(output.stdout.size > 0);
    });

    test("accepts relative file path with cwd", async () => {
      await fs.writeFile(path.join(tmpDir, "relative.txt"), "relative content");

      const { output } = await testResource(exec).create({
        input: {
          command: ["cat"],
          stdinFile: "./relative.txt",
          cwd: tmpDir,
        },
      });

      assert.ok(output.stdout.size > 0);
    });

    test("throws when stdinFile does not exist", async () => {
      await assert.rejects(async () => {
        await testResource(exec).create({
          input: {
            command: ["cat"],
            stdinFile: "./nonexistent.txt",
            cwd: tmpDir,
          },
        });
      });
    });

    test("throws when both stdin and stdinFile are specified", async () => {
      await assert.rejects(
        async () => {
          await testResource(exec).create({
            input: {
              command: ["cat"],
              stdin: "literal",
              stdinFile: "./file.txt",
            },
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
      const { output } = await testResource(exec).create({
        input: {
          command: ["sh", "-c", "echo $MY_CUSTOM_VAR"],
          env: { MY_CUSTOM_VAR: "test_value" },
        },
      });

      assert.ok(output.stdout.size > 0);
    });

    test("sets multiple environment variables", async () => {
      const { output } = await testResource(exec).create({
        input: {
          command: ["sh", "-c", "echo $A$B$C"],
          env: { A: "1", B: "2", C: "3" },
        },
      });

      assert.ok(output.stdout.size > 0);
    });

    test("inherits system PATH", async () => {
      const { output } = await testResource(exec).create({
        input: { command: ["echo", "found"] },
      });

      assert.ok(output.stdout.size > 0);
    });
  });

  describe("working directory", () => {
    test("executes in specified directory", async () => {
      await fs.writeFile(path.join(tmpDir, "cwd-test.txt"), "exists");

      const { output } = await testResource(exec).create({
        input: {
          command: ["ls", "cwd-test.txt"],
          cwd: tmpDir,
        },
      });

      assert.ok(output.stdout.size > 0);
    });

    test("fails when file not in cwd", async () => {
      const otherDir = path.join(tmpDir, "other");
      await fs.mkdir(otherDir);
      await fs.writeFile(path.join(tmpDir, "not-here.txt"), "content");

      await assert.rejects(async () => {
        await testResource(exec).create({
          input: {
            command: ["ls", "not-here.txt"],
            cwd: otherDir,
          },
        });
      });
    });
  });

  describe("timeout", () => {
    test("kills command after timeout", async () => {
      await assert.rejects(
        async () => {
          await testResource(exec).create({
            input: {
              command: ["sleep", "10"],
              timeout: 100,
            },
          });
        },
        (err: Error) => {
          assert.ok(err.message.includes("timed out"));
          return true;
        },
      );
    });

    test("succeeds when command finishes before timeout", async () => {
      const { output } = await testResource(exec).create({
        input: {
          command: ["echo", "fast"],
          timeout: 5000,
        },
      });

      assert.ok(output.stdout.size > 0);
    });
  });

  describe("inputs and outputs declarations", () => {
    test("accepts inputs glob patterns", async () => {
      const workDir = path.join(tmpDir, "inputs-test");
      await fs.mkdir(workDir, { recursive: true });
      await fs.writeFile(path.join(workDir, "source.ts"), "const x = 1;");

      const { output } = await testResource(exec).create({
        input: {
          command: ["echo", "built"],
          cwd: workDir,
          inputs: ["*.ts"],
        },
      });

      assert.equal(output.stdout.kind, "artifact");
    });

    test("accepts outputs glob patterns", async () => {
      const workDir = path.join(tmpDir, "outputs-test");
      await fs.mkdir(workDir, { recursive: true });

      const { output } = await testResource(exec).create({
        input: {
          command: ["sh", "-c", "echo content > output.txt"],
          cwd: workDir,
          outputs: ["*.txt"],
        },
      });

      assert.equal(output.stdout.kind, "artifact");
    });

    test("accepts exclude patterns", async () => {
      const { output } = await testResource(exec).create({
        input: {
          command: ["echo", "done"],
          inputs: ["src/**"],
          outputs: ["dist/**"],
          exclude: ["node_modules/**"],
        },
      });

      assert.equal(output.stdout.kind, "artifact");
    });
  });

  describe("error handling", () => {
    test("throws on non-zero exit code", async () => {
      await assert.rejects(
        async () => {
          await testResource(exec).create({
            input: { command: ["sh", "-c", "exit 1"] },
          });
        },
        (err: Error) => {
          assert.ok(err.message.includes("exit code 1"));
          return true;
        },
      );
    });

    test("throws on exit code 2", async () => {
      await assert.rejects(
        async () => {
          await testResource(exec).create({
            input: { command: ["sh", "-c", "exit 2"] },
          });
        },
        (err: Error) => {
          assert.ok(err.message.includes("exit code 2"));
          return true;
        },
      );
    });

    test("throws on command not found", async () => {
      await assert.rejects(async () => {
        await testResource(exec).create({
          input: { command: ["this-command-does-not-exist-xyz"] },
        });
      });
    });

    test("includes stderr in error for failed commands", async () => {
      await assert.rejects(
        async () => {
          await testResource(exec).create({
            input: {
              command: ["sh", "-c", "echo 'error message' >&2; exit 1"],
            },
          });
        },
        (err: Error) => {
          assert.ok(err.message.includes("error message"));
          return true;
        },
      );
    });

    test("throws on empty command array", async () => {
      await assert.rejects(async () => {
        await testResource(exec).create({
          input: { command: [] },
        });
      });
    });
  });

  describe("real-world scenarios", () => {
    test("npm-like command with env and cwd", async () => {
      const projectDir = path.join(tmpDir, "npm-project");
      await fs.mkdir(projectDir, { recursive: true });

      const { output } = await testResource(exec).create({
        input: {
          command: ["sh", "-c", 'echo "Building in $NODE_ENV mode"'],
          cwd: projectDir,
          env: { NODE_ENV: "production" },
        },
      });

      assert.ok(output.stdout.size > 0);
    });

    test("build with inputs and outputs", async () => {
      const projectDir = path.join(tmpDir, "build-project");
      const srcDir = path.join(projectDir, "src");
      const distDir = path.join(projectDir, "dist");
      await fs.mkdir(srcDir, { recursive: true });
      await fs.mkdir(distDir, { recursive: true });
      await fs.writeFile(path.join(srcDir, "index.ts"), "export const x = 1;");

      const { output } = await testResource(exec).create({
        input: {
          command: ["sh", "-c", "cp src/index.ts dist/index.js"],
          cwd: projectDir,
          inputs: ["src/**/*.ts"],
          outputs: ["dist/**/*.js"],
        },
      });

      assert.ok(output.stdout.kind === "artifact");

      const built = await fs.readFile(path.join(distDir, "index.js"), "utf-8");
      assert.equal(built, "export const x = 1;");
    });

    test("data processing pipeline with stdinFile", async () => {
      const dataDir = path.join(tmpDir, "data-pipeline");
      await fs.mkdir(dataDir, { recursive: true });
      await fs.writeFile(
        path.join(dataDir, "input.csv"),
        "a,b,c\n1,2,3\n4,5,6",
      );

      const { output } = await testResource(exec).create({
        input: {
          command: ["wc", "-l"],
          stdinFile: path.join(dataDir, "input.csv"),
        },
      });

      assert.ok(output.stdout.size > 0);
    });

    test("script with complex arguments", async () => {
      const { output } = await testResource(exec).create({
        input: {
          command: ["sh", "-c", "for i in 1 2 3; do echo $i; done"],
        },
      });

      assert.ok(output.stdout.size > 0);
    });

    test("command with special characters in env", async () => {
      const { output } = await testResource(exec).create({
        input: {
          command: ["sh", "-c", 'echo "$SPECIAL"'],
          env: { SPECIAL: "hello world! @#$%" },
        },
      });

      assert.ok(output.stdout.size > 0);
    });
  });
});
