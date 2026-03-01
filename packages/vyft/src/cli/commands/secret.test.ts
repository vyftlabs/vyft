import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { EncryptedPayload, PersistedState } from "@vyft/store";
import { createFileStore, decrypt, encrypt } from "@vyft/store";

type SecretMap = Record<string, string>;

function decryptSecrets(
  payload: EncryptedPayload | null,
  passphrase: string,
): SecretMap {
  if (!payload) return {};
  return JSON.parse(decrypt(payload, passphrase)) as SecretMap;
}

function encryptSecrets(
  secrets: SecretMap,
  passphrase: string,
): EncryptedPayload | null {
  const keys = Object.keys(secrets);
  if (keys.length === 0) return null;
  return encrypt(JSON.stringify(secrets), passphrase);
}

function emptyState(overrides?: Partial<PersistedState>): PersistedState {
  return {
    version: 1,
    manifest: { timestamp: new Date().toISOString(), tool: "vyft" },
    resources: [],
    secrets: null,
    ...overrides,
  };
}

describe("secret operations", () => {
  let root: string;
  const context = "default";
  const project = "test";
  const stage = "local";
  const passphrase = "test-passphrase";

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "vyft-secret-"));
    // Create the context directory (no key file — passphrase comes from env)
    await mkdir(join(root, context), { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("set creates encrypted secret in state", async () => {
    const store = createFileStore(root);
    const state = emptyState();
    await store.save(context, project, stage, state);

    // Simulate set
    const loaded = await store.load(context, project, stage);
    ok(loaded, "state should exist");
    const secrets = decryptSecrets(loaded.secrets, passphrase);
    secrets["db-password"] = "hunter2";

    const updated = emptyState({
      secrets: encryptSecrets(secrets, passphrase),
    });
    await store.save(context, project, stage, updated);

    // Verify
    const reloaded = await store.load(context, project, stage);
    ok(reloaded, "state should exist after save");
    const result = decryptSecrets(reloaded.secrets, passphrase);
    strictEqual(result["db-password"], "hunter2");
  });

  it("get retrieves a secret by name", async () => {
    const store = createFileStore(root);
    const secrets: SecretMap = { "api-key": "sk-12345" };
    const state = emptyState({ secrets: encryptSecrets(secrets, passphrase) });
    await store.save(context, project, stage, state);

    const loaded = await store.load(context, project, stage);
    ok(loaded, "state should exist");
    const decrypted = decryptSecrets(loaded.secrets, passphrase);
    strictEqual(decrypted["api-key"], "sk-12345");
  });

  it("rm removes a secret", async () => {
    const store = createFileStore(root);
    const secrets: SecretMap = { a: "1", b: "2" };
    const state = emptyState({ secrets: encryptSecrets(secrets, passphrase) });
    await store.save(context, project, stage, state);

    // Simulate rm
    const loaded = await store.load(context, project, stage);
    ok(loaded, "state should exist");
    const decrypted = decryptSecrets(loaded.secrets, passphrase);
    delete decrypted["a"];

    const updated = emptyState({
      secrets: encryptSecrets(decrypted, passphrase),
    });
    await store.save(context, project, stage, updated);

    const reloaded = await store.load(context, project, stage);
    ok(reloaded, "state should exist after save");
    const result = decryptSecrets(reloaded.secrets, passphrase);
    strictEqual("a" in result, false);
    strictEqual(result["b"], "2");
  });

  it("rm last secret sets secrets to null", async () => {
    const store = createFileStore(root);
    const secrets: SecretMap = { only: "one" };
    const state = emptyState({ secrets: encryptSecrets(secrets, passphrase) });
    await store.save(context, project, stage, state);

    const loaded = await store.load(context, project, stage);
    ok(loaded, "state should exist");
    const decrypted = decryptSecrets(loaded.secrets, passphrase);
    delete decrypted["only"];

    const updated = emptyState({
      secrets: encryptSecrets(decrypted, passphrase),
    });
    await store.save(context, project, stage, updated);

    const reloaded = await store.load(context, project, stage);
    ok(reloaded, "state should exist after save");
    strictEqual(reloaded.secrets, null);
  });

  it("ls returns sorted secret names", async () => {
    const secrets: SecretMap = { c: "3", a: "1", b: "2" };
    const state = emptyState({ secrets: encryptSecrets(secrets, passphrase) });

    const store = createFileStore(root);
    await store.save(context, project, stage, state);

    const loaded = await store.load(context, project, stage);
    ok(loaded, "state should exist");
    const decrypted = decryptSecrets(loaded.secrets, passphrase);
    const names = Object.keys(decrypted).sort();

    deepStrictEqual(names, ["a", "b", "c"]);
  });

  it("set overwrites existing secret", async () => {
    const store = createFileStore(root);
    const secrets: SecretMap = { key: "old" };
    const state = emptyState({ secrets: encryptSecrets(secrets, passphrase) });
    await store.save(context, project, stage, state);

    const loaded = await store.load(context, project, stage);
    ok(loaded, "state should exist");
    const decrypted = decryptSecrets(loaded.secrets, passphrase);
    decrypted["key"] = "new";

    const updated = emptyState({
      secrets: encryptSecrets(decrypted, passphrase),
    });
    await store.save(context, project, stage, updated);

    const reloaded = await store.load(context, project, stage);
    ok(reloaded, "state should exist after save");
    const result = decryptSecrets(reloaded.secrets, passphrase);
    strictEqual(result["key"], "new");
  });

  it("preserves resources when updating secrets", async () => {
    const store = createFileStore(root);
    const resources = [
      {
        id: "data",
        kind: "volume" as const,
        fingerprint: "abc",
        inputs: {},
        outputs: {},
        dependencies: [] as string[],
        runtime: {},
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
        taint: false,
      },
    ];

    const state = emptyState({ resources });
    await store.save(context, project, stage, state);

    // Add a secret, preserving resources
    const loaded = await store.load(context, project, stage);
    ok(loaded, "state should exist");
    const secrets = decryptSecrets(loaded.secrets, passphrase);
    secrets["key"] = "value";

    const updated: PersistedState = {
      ...loaded,
      manifest: { timestamp: new Date().toISOString(), tool: "vyft" },
      secrets: encryptSecrets(secrets, passphrase),
    };
    await store.save(context, project, stage, updated);

    const reloaded = await store.load(context, project, stage);
    ok(reloaded, "state should exist after save");
    strictEqual(reloaded.resources.length, 1);
    strictEqual(reloaded.resources[0]?.id, "data");
  });
});
