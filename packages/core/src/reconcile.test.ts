import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryBackend, Store } from "@vyft/store";
import type { Context } from "./context.ts";
import { reconcile } from "./reconcile.ts";
import type { ResourceDefinition } from "./resource.ts";
import { RESOURCE } from "./resource.ts";
import type { Cipher } from "./secret.ts";

const TEST_URN = "urn:vyft:resource:test:thing:my_thing";

function makeCipher(): Cipher {
  return {
    encrypt: async (v: string) => ({ kind: "secret" as const, cipher: v }),
    decrypt: async (v: unknown) => (v as { cipher: string }).cipher,
  } as unknown as Cipher;
}

function makeResource(
  handlers: ResourceDefinition["handlers"],
): ResourceDefinition {
  return { [RESOURCE]: true as const, name: "thing", handlers };
}

async function makeCtx(
  store: Store,
  handlers: ResourceDefinition["handlers"],
): Promise<Context> {
  return {
    store,
    cipher: makeCipher(),
    providers: {
      test: {
        config: {
          context: async () => ({}),
          resources: { thing: makeResource(handlers) },
        },
      },
    } as unknown as Context["providers"],
    createArtifacts: () => ({
      write: async () => ({ key: "k" }),
      read: async () => Buffer.from(""),
      exists: async () => false,
      delete: async () => {},
    }),
  };
}

async function seedPending(store: Store): Promise<void> {
  await store.append({
    type: "set",
    key: TEST_URN,
    data: {
      status: "pending",
      urn: TEST_URN,
      action: "create",
      input: { name: "my_thing" },
    },
  });
}

describe("reconcile", () => {
  it("promotes pending entry to committed when read succeeds", async () => {
    const store = await Store.open(new MemoryBackend());
    await seedPending(store);

    const ctx = await makeCtx(store, {
      read: async () => ({ id: "abc", active: true }),
    });

    await reconcile(ctx);

    assert.equal(store.has(TEST_URN), true);
    const data = store.get(TEST_URN) as Record<string, unknown>;
    assert.equal(data["status"], "committed");
    assert.deepEqual(data["output"], { id: "abc", active: true });
  });

  it("removes pending entry when read throws", async () => {
    const store = await Store.open(new MemoryBackend());
    await seedPending(store);

    const ctx = await makeCtx(store, {
      read: async () => {
        throw new Error("not found");
      },
    });

    await reconcile(ctx);

    assert.equal(store.has(TEST_URN), false);
  });

  it("removes pending entry when no read handler exists (ephemeral resource)", async () => {
    const store = await Store.open(new MemoryBackend());
    await seedPending(store);

    const ctx = await makeCtx(store, {
      create: async () => ({ output: {} }),
    });

    await reconcile(ctx);

    assert.equal(store.has(TEST_URN), false);
  });

  it("removes pending entry for unknown provider", async () => {
    const store = await Store.open(new MemoryBackend());
    await store.append({
      type: "set",
      key: "urn:vyft:resource:unknown:thing:x",
      data: {
        status: "pending",
        urn: "urn:vyft:resource:unknown:thing:x",
        action: "create",
        input: {},
      },
    });

    const ctx = await makeCtx(store, {});

    await reconcile(ctx);

    assert.equal(store.has("urn:vyft:resource:unknown:thing:x"), false);
  });

  it("does not touch already-committed entries", async () => {
    const store = await Store.open(new MemoryBackend());
    await store.append({
      type: "set",
      key: TEST_URN,
      data: {
        status: "committed",
        urn: TEST_URN,
        action: "create",
        input: { name: "my_thing" },
        output: { id: "existing" },
      },
    });

    let readCalled = false;
    const ctx = await makeCtx(store, {
      read: async () => {
        readCalled = true;
        return { id: "new" };
      },
    });

    await reconcile(ctx);

    assert.equal(readCalled, false);
    const data = store.get(TEST_URN) as Record<string, unknown>;
    assert.deepEqual(
      (data["output"] as Record<string, unknown>)["id"],
      "existing",
    );
  });
});
