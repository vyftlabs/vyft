import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryBackend, Store } from "@vyft/store";
import type { Context } from "./context.ts";
import { reconcile } from "./reconcile.ts";
import { RESOURCE } from "./resource.ts";
import type { ResourceDefinition } from "./resource.ts";
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
  return {
    [RESOURCE]: true as const,
    name: "thing",
    handlers,
  };
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
          name: "test",
          context: async () => ({}),
          resources: {
            thing: makeResource(handlers),
          },
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

describe("reconcile", () => {
  it("promotes a pending entry to committed when read succeeds", async () => {
    const backend = new MemoryBackend();
    const store = await Store.open(backend);

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

    const ctx = await makeCtx(store, {
      read: async () => ({ id: "ext-123", name: "my_thing" }),
    });

    await reconcile(ctx);

    assert.ok(store.has(TEST_URN), "entry should still exist after reconcile");
    const data = store.get(TEST_URN) as Record<string, unknown>;
    assert.equal(data["status"], "committed", "entry should be promoted to committed");
    assert.deepEqual(data["output"], { id: "ext-123", name: "my_thing" });
    assert.equal(data["action"], "create");
    assert.deepEqual(data["input"], { name: "my_thing" });
  });

  it("removes a pending entry when read throws (resource was not created)", async () => {
    const backend = new MemoryBackend();
    const store = await Store.open(backend);

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

    const ctx = await makeCtx(store, {
      read: async () => {
        throw new Error("not found");
      },
    });

    await reconcile(ctx);

    assert.equal(store.has(TEST_URN), false, "pending entry should be removed when read throws");
  });

  it("leaves a pending entry untouched when there is no read handler", async () => {
    const backend = new MemoryBackend();
    const store = await Store.open(backend);

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

    const ctx = await makeCtx(store, {
      create: async () => ({ output: {} }),
    });

    await reconcile(ctx);

    assert.ok(store.has(TEST_URN), "entry should remain when there is no read handler");
    const data = store.get(TEST_URN) as Record<string, unknown>;
    assert.equal(data["status"], "pending", "status should remain pending");
  });

  it("removes a pending entry when the provider is unknown", async () => {
    const backend = new MemoryBackend();
    const store = await Store.open(backend);

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

    // Context with no providers
    const ctx: Context = {
      store,
      cipher: makeCipher(),
      providers: {} as Context["providers"],
      createArtifacts: () => ({
        write: async () => ({ key: "k" }),
        read: async () => Buffer.from(""),
        exists: async () => false,
        delete: async () => {},
      }),
    };

    await reconcile(ctx);

    assert.equal(store.has(TEST_URN), false, "pending entry with unknown provider should be removed");
  });

  it("does not affect already-committed entries", async () => {
    const backend = new MemoryBackend();
    const store = await Store.open(backend);

    await store.append({
      type: "set",
      key: TEST_URN,
      data: {
        status: "committed",
        urn: TEST_URN,
        action: "create",
        input: { name: "my_thing" },
        output: { id: "ext-123" },
      },
    });

    const ctx = await makeCtx(store, {
      read: async () => ({ id: "overwritten" }),
    });

    await reconcile(ctx);

    const data = store.get(TEST_URN) as Record<string, unknown>;
    assert.equal(data["status"], "committed");
    assert.deepEqual(data["output"], { id: "ext-123" }, "committed entry output should not be modified");
  });
});
