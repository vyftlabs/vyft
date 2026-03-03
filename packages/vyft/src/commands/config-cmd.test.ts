import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { EncryptedPayload, StageData } from "@vyft/store";
import { createStageStore, decrypt, encrypt } from "@vyft/store";

// We test config command logic directly rather than through CLI dispatch,
// since the command depends on process.cwd(). We test the underlying
// operations that config set/get/rm/ls/rotate perform.

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

function makeStageData(overrides: Partial<StageData> = {}): StageData {
  return {
    version: 1,
    values: {},
    secrets: null,
    ...overrides,
  };
}

describe("config set", () => {
  let root: string;
  const passphrase = "test-passphrase";

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "vyft-config-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("sets a plain value", async () => {
    const store = createStageStore(root);
    await store.saveStage("local", makeStageData());

    // Simulate set
    const data = (await store.loadStage("local")) ?? makeStageData();
    await store.saveStage("local", {
      ...data,
      values: { ...data.values, DB_URL: "postgres://localhost/mydb" },
    });

    const loaded = await store.loadStage("local");
    ok(loaded, "stage should exist");
    strictEqual(loaded.values["DB_URL"], "postgres://localhost/mydb");
  });

  it("sets a secret value", async () => {
    const store = createStageStore(root);
    await store.saveStage("local", makeStageData());

    // Simulate set --secret
    const data = (await store.loadStage("local")) ?? makeStageData();
    const secrets = decryptSecrets(data.secrets, passphrase);
    secrets["DB_PASSWORD"] = "hunter2";
    await store.saveStage("local", {
      ...data,
      secrets: encryptSecrets(secrets, passphrase),
    });

    const loaded = await store.loadStage("local");
    ok(loaded, "stage should exist");
    const result = decryptSecrets(loaded.secrets, passphrase);
    strictEqual(result["DB_PASSWORD"], "hunter2");
  });

  it("setting a secret removes it from plain values", async () => {
    const store = createStageStore(root);
    await store.saveStage(
      "local",
      makeStageData({
        values: { KEY: "plain-value" },
      }),
    );

    // Simulate set --secret (moves KEY from values to secrets)
    const data = (await store.loadStage("local")) ?? makeStageData();
    const secrets = decryptSecrets(data.secrets, passphrase);
    secrets["KEY"] = "secret-value";
    const { KEY: _, ...remainingValues } = data.values;
    await store.saveStage("local", {
      ...data,
      values: remainingValues,
      secrets: encryptSecrets(secrets, passphrase),
    });

    const loaded = await store.loadStage("local");
    ok(loaded, "stage should exist");
    strictEqual("KEY" in loaded.values, false);
    const result = decryptSecrets(loaded.secrets, passphrase);
    strictEqual(result["KEY"], "secret-value");
  });

  it("setting a plain value removes it from secrets", async () => {
    const store = createStageStore(root);
    const secrets: SecretMap = { KEY: "was-secret" };
    await store.saveStage(
      "local",
      makeStageData({
        secrets: encryptSecrets(secrets, passphrase),
      }),
    );

    // Simulate set (plain, removes from secrets)
    const data = (await store.loadStage("local")) ?? makeStageData();
    const existingSecrets = decryptSecrets(data.secrets, passphrase);
    delete existingSecrets["KEY"];
    await store.saveStage("local", {
      ...data,
      values: { ...data.values, KEY: "now-plain" },
      secrets: encryptSecrets(existingSecrets, passphrase),
    });

    const loaded = await store.loadStage("local");
    ok(loaded, "stage should exist");
    strictEqual(loaded.values["KEY"], "now-plain");
    strictEqual(loaded.secrets, null);
  });

  it("overwrites existing plain value", async () => {
    const store = createStageStore(root);
    await store.saveStage("local", makeStageData({ values: { A: "1" } }));

    const data = (await store.loadStage("local")) ?? makeStageData();
    await store.saveStage("local", {
      ...data,
      values: { ...data.values, A: "2" },
    });

    const loaded = await store.loadStage("local");
    ok(loaded, "stage should exist");
    strictEqual(loaded.values["A"], "2");
  });

  it("creates stage data if it doesn't exist", async () => {
    const store = createStageStore(root);

    // Simulate set on non-existent stage
    const data = (await store.loadStage("local")) ?? makeStageData();
    await store.saveStage("local", {
      ...data,
      values: { ...data.values, X: "val" },
    });

    const loaded = await store.loadStage("local");
    ok(loaded, "stage should be created");
    strictEqual(loaded.values["X"], "val");
  });
});

describe("config get", () => {
  let root: string;
  const passphrase = "test-passphrase";

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "vyft-config-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("retrieves a plain value", async () => {
    const store = createStageStore(root);
    await store.saveStage(
      "prod",
      makeStageData({
        values: { DB_URL: "postgres://prod/db" },
      }),
    );

    const data = await store.loadStage("prod");
    ok(data, "stage should exist");
    strictEqual(data.values["DB_URL"], "postgres://prod/db");
  });

  it("retrieves a secret value", async () => {
    const store = createStageStore(root);
    const secrets: SecretMap = { API_KEY: "sk-12345" };
    await store.saveStage(
      "prod",
      makeStageData({
        secrets: encryptSecrets(secrets, passphrase),
      }),
    );

    const data = await store.loadStage("prod");
    ok(data, "stage should exist");
    const result = decryptSecrets(data.secrets, passphrase);
    strictEqual(result["API_KEY"], "sk-12345");
  });
});

describe("config rm", () => {
  let root: string;
  const passphrase = "test-passphrase";

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "vyft-config-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("removes a plain value", async () => {
    const store = createStageStore(root);
    await store.saveStage(
      "local",
      makeStageData({
        values: { A: "1", B: "2" },
      }),
    );

    const data = await store.loadStage("local");
    ok(data, "stage should exist");
    const { A: _, ...remaining } = data.values;
    await store.saveStage("local", { ...data, values: remaining });

    const loaded = await store.loadStage("local");
    ok(loaded, "stage should exist");
    strictEqual("A" in loaded.values, false);
    strictEqual(loaded.values["B"], "2");
  });

  it("removes a secret value", async () => {
    const store = createStageStore(root);
    const secrets: SecretMap = { X: "1", Y: "2" };
    await store.saveStage(
      "local",
      makeStageData({
        secrets: encryptSecrets(secrets, passphrase),
      }),
    );

    const data = await store.loadStage("local");
    ok(data, "stage should exist");
    const decrypted = decryptSecrets(data.secrets, passphrase);
    delete decrypted["X"];
    await store.saveStage("local", {
      ...data,
      secrets: encryptSecrets(decrypted, passphrase),
    });

    const loaded = await store.loadStage("local");
    ok(loaded, "stage should exist");
    const result = decryptSecrets(loaded.secrets, passphrase);
    strictEqual("X" in result, false);
    strictEqual(result["Y"], "2");
  });

  it("removing last secret sets secrets to null", async () => {
    const store = createStageStore(root);
    const secrets: SecretMap = { ONLY: "one" };
    await store.saveStage(
      "local",
      makeStageData({
        secrets: encryptSecrets(secrets, passphrase),
      }),
    );

    const data = await store.loadStage("local");
    ok(data, "stage should exist");
    const decrypted = decryptSecrets(data.secrets, passphrase);
    delete decrypted["ONLY"];
    await store.saveStage("local", {
      ...data,
      secrets: encryptSecrets(decrypted, passphrase),
    });

    const loaded = await store.loadStage("local");
    ok(loaded, "stage should exist");
    strictEqual(loaded.secrets, null);
  });
});

describe("config ls", () => {
  let root: string;
  const passphrase = "test-passphrase";

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "vyft-config-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("lists plain and secret names sorted", async () => {
    const store = createStageStore(root);
    const secrets: SecretMap = { Z_SECRET: "val", A_SECRET: "val" };
    await store.saveStage(
      "prod",
      makeStageData({
        values: { M_PLAIN: "val", B_PLAIN: "val" },
        secrets: encryptSecrets(secrets, passphrase),
      }),
    );

    const data = await store.loadStage("prod");
    ok(data, "stage should exist");
    const valueNames = Object.keys(data.values);
    const secretNames = Object.keys(decryptSecrets(data.secrets, passphrase));
    const allNames = [...new Set([...valueNames, ...secretNames])].sort();

    deepStrictEqual(allNames, ["A_SECRET", "B_PLAIN", "M_PLAIN", "Z_SECRET"]);
  });

  it("annotates secret names", async () => {
    const store = createStageStore(root);
    const secrets: SecretMap = { DB_PW: "val" };
    await store.saveStage(
      "prod",
      makeStageData({
        values: { DB_URL: "val" },
        secrets: encryptSecrets(secrets, passphrase),
      }),
    );

    const data = await store.loadStage("prod");
    ok(data, "stage should exist");
    const secretNameSet = new Set(
      Object.keys(decryptSecrets(data.secrets, passphrase)),
    );

    ok(!secretNameSet.has("DB_URL"), "DB_URL should not be a secret");
    ok(secretNameSet.has("DB_PW"), "DB_PW should be a secret");
  });

  it("returns empty when no config values exist", async () => {
    const store = createStageStore(root);
    await store.saveStage("local", makeStageData());

    const data = await store.loadStage("local");
    ok(data, "stage should exist");
    const allNames = Object.keys(data.values);
    strictEqual(allNames.length, 0);
    strictEqual(data.secrets, null);
  });
});

describe("config stage scoping", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "vyft-config-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("values are scoped per stage", async () => {
    const store = createStageStore(root);
    await store.saveStage(
      "local",
      makeStageData({
        values: { DB_URL: "postgres://localhost/dev" },
      }),
    );
    await store.saveStage(
      "prod",
      makeStageData({
        values: { DB_URL: "postgres://prod-host/prod" },
      }),
    );

    const localData = await store.loadStage("local");
    const prodData = await store.loadStage("prod");

    ok(localData, "local stage should exist");
    ok(prodData, "prod stage should exist");
    strictEqual(localData.values["DB_URL"], "postgres://localhost/dev");
    strictEqual(prodData.values["DB_URL"], "postgres://prod-host/prod");
  });

  it("modifying one stage does not affect another", async () => {
    const store = createStageStore(root);
    await store.saveStage(
      "staging",
      makeStageData({
        values: { A: "1" },
      }),
    );
    await store.saveStage(
      "prod",
      makeStageData({
        values: { A: "2" },
      }),
    );

    // Modify staging
    const data = await store.loadStage("staging");
    ok(data, "staging should exist");
    await store.saveStage("staging", {
      ...data,
      values: { ...data.values, A: "updated" },
    });

    // Prod should be unchanged
    const prodData = await store.loadStage("prod");
    ok(prodData, "prod should exist");
    strictEqual(prodData.values["A"], "2");
  });
});
