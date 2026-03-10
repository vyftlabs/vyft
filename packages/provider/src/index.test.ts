import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isOutput, RESOURCE, registry } from "@vyft/core";
import { createProvider, defineResource } from "./index.ts";

describe("defineResource", () => {
  it("creates a resource definition with RESOURCE brand", () => {
    interface FileInput {
      path: string;
    }

    const file = defineResource<FileInput>("file", {
      async create({ input }) {
        return { output: { path: input.path } };
      },
    });

    assert.equal(file[RESOURCE], true);
    assert.equal(file.name, "file");
    assert.ok(file.handlers.create);
  });

  it("creates a resource definition without handlers", () => {
    const empty = defineResource<Record<string, never>>("empty", {});
    assert.equal(empty[RESOURCE], true);
    assert.equal(empty.name, "empty");
  });
});

describe("createProvider", () => {
  it("creates constructors from resources", () => {
    interface SnapshotInput {
      serverId: string;
    }

    const snapshot = defineResource<SnapshotInput>("snapshot", {
      async create({ input }) {
        return { output: { id: input.serverId } };
      },
    });

    const provider = createProvider({
      name: "test",
      context: async () => ({ userId: "test" }),
      resources: { snapshot },
    });

    assert.equal(typeof provider.snapshot, "function");
  });

  it("preserves nested namespace structure", () => {
    const file = defineResource<{ path: string }>("file", {
      async create({ input }) {
        return { output: { path: input.path } };
      },
    });

    const uuid = defineResource<Record<string, never>>("uuid", {
      async create() {
        return { output: { id: "test" } };
      },
    });

    const provider = createProvider({
      name: "test",
      context: async () => ({ userId: "test" }),
      resources: {
        fs: { file },
        crypto: { uuid },
      },
    });

    assert.equal(typeof provider.fs.file, "function");
    assert.equal(typeof provider.crypto.uuid, "function");
  });

  it("constructors return ResourceHandle that is also an Output", () => {
    const snapshot = defineResource<{ serverId: string }>("snapshot", {
      async create({ input }) {
        return { output: { id: input.serverId } };
      },
    });

    const provider = createProvider({
      name: "test",
      context: async () => ({ userId: "test" }),
      resources: { snapshot },
    });

    registry.begin();
    const handle = provider.snapshot("my-snap", { serverId: "srv-1" });
    const entries = registry.collect();

    // Handle is an Output — isOutput narrows to OutputRef
    assert.ok(isOutput(handle));
    assert.equal(handle.path, "");

    assert.ok(handle.urn);
    assert.ok(handle.urn.includes("test"));
    assert.ok(handle.urn.includes("snapshot"));
    assert.ok(handle.urn.includes("my-snap"));

    // Property access returns Output for specific key
    const idHandle = (handle as unknown as Record<string, unknown>)["id"];
    assert.ok(isOutput(idHandle));
    assert.equal(idHandle.path, "id");

    // Entry registered in registry
    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.urn, handle.urn);
  });

  it("throws on duplicate resource names across namespaces", () => {
    const file = defineResource<{ path: string }>("file", {
      async create({ input }) {
        return { output: { path: input.path } };
      },
    });

    const file2 = defineResource<{ path: string }>("file", {
      async create({ input }) {
        return { output: { path: input.path } };
      },
    });

    assert.throws(() => {
      createProvider({
        name: "test",
        context: async () => ({ userId: "test" }),
        resources: {
          fs: { file },
          other: { file: file2 },
        },
      });
    }, /Duplicate resource name/);
  });
});
