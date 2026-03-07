import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { State } from "@vyft/engine";
import { MemoryBackend, Store } from "@vyft/store";
import { apply } from "./apply.ts";
import type { Context } from "./context.ts";
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
  return {
    [RESOURCE]: true as const,
    name: "thing",
    handlers,
  };
}

async function makeCtx(store: Store): Promise<Context> {
  return {
    store,
    cipher: makeCipher(),
    providers: {
      test: {
        config: {
          name: "test",
          context: async () => ({}),
          resources: {
            thing: makeResource({
              create: async () => ({
                output: { created: true },
              }),
              delete: async () => {},
            }),
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

describe("apply", () => {
  describe("delete WAL bug", () => {
    it("should remove entry from store after deleting a resource", async () => {
      const backend = new MemoryBackend();
      const store = await Store.open(backend);

      // Simulate a previously-created resource in the store
      await store.append({
        type: "set",
        key: TEST_URN,
        data: {
          status: "committed",
          urn: TEST_URN,
          action: "create",
          input: { name: "my_thing" },
          output: { created: true },
        },
      });

      const ctx = await makeCtx(store);

      const current: State = {
        entries: {
          [TEST_URN]: {
            urn: TEST_URN,
            input: { name: "my_thing" },
            output: { created: true },
          },
        },
      };

      // Desired state is empty — this should trigger a delete
      const desired: State = { entries: {} };

      await apply(desired, current, ctx);

      // BUG: After delete, the store should NOT have this key anymore.
      // The current code writes { type: "set" } instead of { type: "remove" },
      // so the entry persists as a ghost.
      assert.equal(
        store.has(TEST_URN),
        false,
        "Deleted resource should be removed from store, not persisted as a ghost entry",
      );
    });

    it("should still persist entries for create actions", async () => {
      const backend = new MemoryBackend();
      const store = await Store.open(backend);
      const ctx = await makeCtx(store);

      const current: State = { entries: {} };
      const desired: State = {
        entries: {
          [TEST_URN]: {
            urn: TEST_URN,
            input: { name: "my_thing" },
          },
        },
      };

      await apply(desired, current, ctx);

      // Create should still use { type: "set" }
      assert.equal(store.has(TEST_URN), true);
      const data = store.get(TEST_URN) as Record<string, unknown>;
      assert.equal(data["status"], "committed");
    });
  });
});
