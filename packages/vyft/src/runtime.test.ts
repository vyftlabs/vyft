import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { resolvePassphrase } from "./runtime.ts";

function configPath(project: string): string {
  return path.join(os.homedir(), ".config", "vyft", project, "passphrase");
}

async function cleanupProject(project: string): Promise<void> {
  try {
    await fs.rm(path.join(os.homedir(), ".config", "vyft", project), { recursive: true });
  } catch {
    // ignore
  }
}

describe("resolvePassphrase", () => {
  const savedEnv = process.env["VYFT_PASSPHRASE"];

  afterEach(() => {
    if (savedEnv === undefined) {
      delete process.env["VYFT_PASSPHRASE"];
    } else {
      process.env["VYFT_PASSPHRASE"] = savedEnv;
    }
  });

  it("returns VYFT_PASSPHRASE env var when set", async () => {
    process.env["VYFT_PASSPHRASE"] = "env-secret";
    const result = await resolvePassphrase("any-project", "deploy");
    assert.equal(result, "env-secret");
  });

  it("returns persisted passphrase when file exists (deploy mode)", async () => {
    delete process.env["VYFT_PASSPHRASE"];
    const project = `test-${Date.now()}`;
    const filePath = configPath(project);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "stored-secret", { mode: 0o600 });
    try {
      const result = await resolvePassphrase(project, "deploy");
      assert.equal(result, "stored-secret");
    } finally {
      await cleanupProject(project);
    }
  });

  it("trims trailing newlines from persisted passphrase file", async () => {
    delete process.env["VYFT_PASSPHRASE"];
    const project = `test-trim-${Date.now()}`;
    const filePath = configPath(project);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "my-passphrase\n", { mode: 0o600 });
    try {
      const result = await resolvePassphrase(project, "deploy");
      assert.equal(result, "my-passphrase");
    } finally {
      await cleanupProject(project);
    }
  });

  it("treats whitespace-only passphrase file as absent", async () => {
    delete process.env["VYFT_PASSPHRASE"];
    const project = `test-whitespace-${Date.now()}`;
    const filePath = configPath(project);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "   \n", { mode: 0o600 });
    try {
      // local mode: should generate a new passphrase since file content is empty after trim
      const result = await resolvePassphrase(project, "local");
      assert.ok(result.length > 0);
      assert.notEqual(result.trim(), "");
    } finally {
      await cleanupProject(project);
    }
  });

  it("generates and persists a passphrase in local mode", async () => {
    delete process.env["VYFT_PASSPHRASE"];
    const project = `test-local-${Date.now()}`;
    try {
      const result = await resolvePassphrase(project, "local");
      assert.ok(result.length > 0);
      const saved = await fs.readFile(configPath(project), "utf8");
      assert.equal(saved, result);
    } finally {
      await cleanupProject(project);
    }
  });

  it("returns same generated passphrase on subsequent local calls", async () => {
    delete process.env["VYFT_PASSPHRASE"];
    const project = `test-idempotent-${Date.now()}`;
    try {
      const first = await resolvePassphrase(project, "local");
      const second = await resolvePassphrase(project, "local");
      assert.equal(first, second);
    } finally {
      await cleanupProject(project);
    }
  });

  it("env var takes precedence over persisted passphrase", async () => {
    const project = `test-priority-${Date.now()}`;
    const filePath = configPath(project);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "file-secret", { mode: 0o600 });
    process.env["VYFT_PASSPHRASE"] = "env-wins";
    try {
      const result = await resolvePassphrase(project, "deploy");
      assert.equal(result, "env-wins");
    } finally {
      await cleanupProject(project);
    }
  });
});
