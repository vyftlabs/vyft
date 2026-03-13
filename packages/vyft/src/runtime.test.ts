import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { type PassphraseStore, resolvePassphrase } from "./runtime.ts";

function memoryStore(
  initial?: Record<string, string>,
): PassphraseStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial ?? {}));
  return {
    data,
    async get(project: string) {
      return data.get(project) ?? null;
    },
    async set(project: string, value: string) {
      data.set(project, value);
      return true;
    },
  };
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
    const store = memoryStore();
    const result = await resolvePassphrase("any-project", "deploy", store);
    assert.equal(result, "env-secret");
  });

  it("env var takes precedence over keyring entry", async () => {
    process.env["VYFT_PASSPHRASE"] = "env-wins";
    const store = memoryStore({ "my-project": "keyring-secret" });
    const result = await resolvePassphrase("my-project", "deploy", store);
    assert.equal(result, "env-wins");
  });

  it("returns passphrase from keyring store when present", async () => {
    delete process.env["VYFT_PASSPHRASE"];
    const store = memoryStore({ "my-project": "keyring-secret" });
    const result = await resolvePassphrase("my-project", "deploy", store);
    assert.equal(result, "keyring-secret");
  });

  it("generates and stores passphrase in local mode", async () => {
    delete process.env["VYFT_PASSPHRASE"];
    const store = memoryStore();
    const result = await resolvePassphrase("my-project", "local", store);
    assert.ok(result.length > 0);
    assert.equal(store.data.get("my-project"), result);
  });

  it("returns same stored passphrase on subsequent local calls", async () => {
    delete process.env["VYFT_PASSPHRASE"];
    const store = memoryStore();
    const first = await resolvePassphrase("my-project", "local", store);
    const second = await resolvePassphrase("my-project", "local", store);
    assert.equal(first, second);
  });

  it("warns when keyring is unavailable in local mode", async () => {
    delete process.env["VYFT_PASSPHRASE"];
    const store: PassphraseStore = {
      async get() {
        return null;
      },
      async set() {
        return false;
      },
    };
    const result = await resolvePassphrase("my-project", "local", store);
    assert.ok(result.length > 0);
  });

  it("throws in non-TTY deploy mode when no passphrase available", async () => {
    delete process.env["VYFT_PASSPHRASE"];
    const store = memoryStore();
    const originalIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", {
      value: false,
      configurable: true,
    });
    try {
      await assert.rejects(
        () => resolvePassphrase("my-project", "deploy", store),
        {
          message:
            "No passphrase found. Set the VYFT_PASSPHRASE environment variable.",
        },
      );
    } finally {
      Object.defineProperty(process.stdin, "isTTY", {
        value: originalIsTTY,
        configurable: true,
      });
    }
  });

  it("throws in non-TTY read mode when no passphrase available", async () => {
    delete process.env["VYFT_PASSPHRASE"];
    const store = memoryStore();
    const originalIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", {
      value: false,
      configurable: true,
    });
    try {
      await assert.rejects(
        () => resolvePassphrase("my-project", "read", store),
        {
          message:
            "No passphrase found. Set the VYFT_PASSPHRASE environment variable.",
        },
      );
    } finally {
      Object.defineProperty(process.stdin, "isTTY", {
        value: originalIsTTY,
        configurable: true,
      });
    }
  });
});
