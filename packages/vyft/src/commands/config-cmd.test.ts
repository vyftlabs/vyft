import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { ResourceState } from "@vyft/core";
import { buildURN, parseURN } from "@vyft/core";
import type { URN } from "@vyft/primitives";
import type { EncryptedPayload } from "@vyft/store";
import { decrypt, encrypt, Store } from "@vyft/store";

// We test config command logic directly rather than through CLI dispatch,
// since the command depends on process.cwd(). We test the underlying
// operations that variable set/get/rm/ls perform on the Store.

function variableURN(name: string) {
  return buildURN("platform", "default", "variable", name);
}

function makeVariableState(
  name: string,
  value: string,
  secret: boolean,
  passphrase: string,
  existing?: ResourceState,
): ResourceState {
  const now = new Date().toISOString();
  const outputs: Record<string, unknown> = secret
    ? { value: encrypt(value, passphrase) }
    : { value };
  return {
    urn: variableURN(name),
    fingerprint: JSON.stringify(outputs),
    inputs: {},
    outputs,
    dependencies: [],
    created: existing?.created ?? now,
    modified: now,
    taint: false,
    ...(secret ? { sensitive: ["value"] } : {}),
  };
}

function toMap(entries: ResourceState[]): Map<URN, ResourceState> {
  const m = new Map<URN, ResourceState>();
  for (const e of entries) m.set(e.urn, e);
  return m;
}

describe("variable set", () => {
  let root: string;
  const passphrase = "test-passphrase";

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "vyft-config-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("sets a plain value", async () => {
    const dir = join(root, "state");
    const store = await Store.open(dir);
    const rs = makeVariableState(
      "DB_URL",
      "postgres://localhost/mydb",
      false,
      passphrase,
    );
    store.state = toMap([rs]);
    await store.checkpoint();
    await store.dispose();

    const store2 = await Store.open(dir);
    const found = store2.state.get(variableURN("DB_URL"));
    ok(found, "variable should exist");
    strictEqual(found.outputs["value"], "postgres://localhost/mydb");
    await store2.dispose();
  });

  it("sets a secret value", async () => {
    const dir = join(root, "state");
    const store = await Store.open(dir);
    const rs = makeVariableState("DB_PASSWORD", "hunter2", true, passphrase);
    store.state = toMap([rs]);
    await store.checkpoint();
    await store.dispose();

    const store2 = await Store.open(dir);
    const found = store2.state.get(variableURN("DB_PASSWORD"));
    ok(found, "variable should exist");
    ok(found.sensitive?.includes("value"), "should be marked as sensitive");
    const decrypted = decrypt(
      found.outputs["value"] as EncryptedPayload,
      passphrase,
    );
    strictEqual(decrypted, "hunter2");
    await store2.dispose();
  });

  it("overwrites existing plain value", async () => {
    const dir = join(root, "state");
    const store = await Store.open(dir);
    store.state = toMap([makeVariableState("A", "1", false, passphrase)]);
    await store.checkpoint();
    await store.dispose();

    const store2 = await Store.open(dir);
    const existing = store2.state.get(variableURN("A"));
    const updated = makeVariableState("A", "2", false, passphrase, existing);
    store2.state = toMap([updated]);
    await store2.checkpoint();
    await store2.dispose();

    const store3 = await Store.open(dir);
    const found = store3.state.get(variableURN("A"));
    ok(found, "variable should exist");
    strictEqual(found.outputs["value"], "2");
    await store3.dispose();
  });

  it("creates variable on empty store", async () => {
    const dir = join(root, "state");
    const store = await Store.open(dir);
    strictEqual(store.state.size, 0);
    store.state = toMap([makeVariableState("X", "val", false, passphrase)]);
    await store.checkpoint();
    await store.dispose();

    const store2 = await Store.open(dir);
    strictEqual(store2.state.size, 1);
    const entry = [...store2.state.values()][0];
    strictEqual(entry?.outputs["value"], "val");
    await store2.dispose();
  });
});

describe("variable get", () => {
  let root: string;
  const passphrase = "test-passphrase";

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "vyft-config-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("retrieves a plain value", async () => {
    const dir = join(root, "state");
    const store = await Store.open(dir);
    store.state = toMap([
      makeVariableState("DB_URL", "postgres://prod/db", false, passphrase),
    ]);
    await store.checkpoint();
    await store.dispose();

    const store2 = await Store.open(dir);
    const found = store2.state.get(variableURN("DB_URL"));
    ok(found, "variable should exist");
    strictEqual(found.outputs["value"], "postgres://prod/db");
    await store2.dispose();
  });

  it("retrieves a secret value", async () => {
    const dir = join(root, "state");
    const store = await Store.open(dir);
    store.state = toMap([
      makeVariableState("API_KEY", "sk-12345", true, passphrase),
    ]);
    await store.checkpoint();
    await store.dispose();

    const store2 = await Store.open(dir);
    const found = store2.state.get(variableURN("API_KEY"));
    ok(found, "variable should exist");
    const decrypted = decrypt(
      found.outputs["value"] as EncryptedPayload,
      passphrase,
    );
    strictEqual(decrypted, "sk-12345");
    await store2.dispose();
  });
});

describe("variable rm", () => {
  let root: string;
  const passphrase = "test-passphrase";

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "vyft-config-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("removes a variable", async () => {
    const dir = join(root, "state");
    const store = await Store.open(dir);
    store.state = toMap([
      makeVariableState("A", "1", false, passphrase),
      makeVariableState("B", "2", false, passphrase),
    ]);
    await store.checkpoint();
    await store.dispose();

    const store2 = await Store.open(dir);
    store2.state.delete(variableURN("A"));
    await store2.checkpoint();
    await store2.dispose();

    const store3 = await Store.open(dir);
    strictEqual(store3.state.size, 1);
    const entry = [...store3.state.values()][0];
    ok(entry);
    strictEqual(parseURN(entry.urn).id, "B");
    await store3.dispose();
  });

  it("removes a secret variable", async () => {
    const dir = join(root, "state");
    const store = await Store.open(dir);
    store.state = toMap([
      makeVariableState("X", "1", true, passphrase),
      makeVariableState("Y", "2", true, passphrase),
    ]);
    await store.checkpoint();
    await store.dispose();

    const store2 = await Store.open(dir);
    store2.state.delete(variableURN("X"));
    await store2.checkpoint();
    await store2.dispose();

    const store3 = await Store.open(dir);
    strictEqual(store3.state.size, 1);
    const entry = [...store3.state.values()][0];
    ok(entry);
    strictEqual(parseURN(entry.urn).id, "Y");
    await store3.dispose();
  });
});

describe("variable ls", () => {
  let root: string;
  const passphrase = "test-passphrase";

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "vyft-config-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("lists plain and secret names sorted", async () => {
    const dir = join(root, "state");
    const store = await Store.open(dir);
    store.state = toMap([
      makeVariableState("M_PLAIN", "val", false, passphrase),
      makeVariableState("B_PLAIN", "val", false, passphrase),
      makeVariableState("Z_SECRET", "val", true, passphrase),
      makeVariableState("A_SECRET", "val", true, passphrase),
    ]);
    await store.checkpoint();
    await store.dispose();

    const store2 = await Store.open(dir);
    const variables = [...store2.state.values()].filter(
      (r) => parseURN(r.urn).resource === "variable",
    );
    const names = variables.map((r) => parseURN(r.urn).id).sort();
    deepStrictEqual(names, ["A_SECRET", "B_PLAIN", "M_PLAIN", "Z_SECRET"]);
    await store2.dispose();
  });

  it("identifies secret variables", async () => {
    const dir = join(root, "state");
    const store = await Store.open(dir);
    store.state = toMap([
      makeVariableState("DB_URL", "val", false, passphrase),
      makeVariableState("DB_PW", "val", true, passphrase),
    ]);
    await store.checkpoint();
    await store.dispose();

    const store2 = await Store.open(dir);
    const dbUrl = store2.state.get(variableURN("DB_URL"));
    const dbPw = store2.state.get(variableURN("DB_PW"));
    ok(dbUrl, "DB_URL should exist");
    ok(dbPw, "DB_PW should exist");
    ok(!dbUrl.sensitive?.includes("value"), "DB_URL should not be secret");
    ok(dbPw.sensitive?.includes("value"), "DB_PW should be secret");
    await store2.dispose();
  });

  it("returns empty when no variables exist", async () => {
    const dir = join(root, "state");
    const store = await Store.open(dir);
    await store.checkpoint();
    await store.dispose();

    const store2 = await Store.open(dir);
    const variables = [...store2.state.values()].filter(
      (r) => parseURN(r.urn).resource === "variable",
    );
    strictEqual(variables.length, 0);
    await store2.dispose();
  });
});

describe("variable scoping per store directory", () => {
  let root: string;
  const passphrase = "test-passphrase";

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "vyft-config-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("variables are scoped per store directory", async () => {
    const dir1 = join(root, "local");
    const dir2 = join(root, "prod");

    const store1 = await Store.open(dir1);
    store1.state = toMap([
      makeVariableState(
        "DB_URL",
        "postgres://localhost/dev",
        false,
        passphrase,
      ),
    ]);
    await store1.checkpoint();
    await store1.dispose();

    const store2 = await Store.open(dir2);
    store2.state = toMap([
      makeVariableState(
        "DB_URL",
        "postgres://prod-host/prod",
        false,
        passphrase,
      ),
    ]);
    await store2.checkpoint();
    await store2.dispose();

    const s1 = await Store.open(dir1);
    const s2 = await Store.open(dir2);
    const v1 = s1.state.get(variableURN("DB_URL"));
    const v2 = s2.state.get(variableURN("DB_URL"));
    ok(v1 && v2, "both should exist");
    strictEqual(v1.outputs["value"], "postgres://localhost/dev");
    strictEqual(v2.outputs["value"], "postgres://prod-host/prod");
    await s1.dispose();
    await s2.dispose();
  });
});
