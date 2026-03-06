import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import { createProvider, initProvider } from "./index.ts";

interface TestCtx {
  userId: string;
}

describe("initProvider", () => {
  it("creates a builder with resource and platform entrypoints", () => {
    const t = initProvider<TestCtx>();
    assert.ok(t.resource);
    assert.ok(t.platform);
    assert.ok(t.platform.server);
    assert.ok(t.platform.volume);
    assert.ok(t.platform.network);
  });
});

describe("resource builder", () => {
  it("defines a resource with input and handlers", () => {
    const t = initProvider<TestCtx>();

    const snapshot = t.resource
      .input(z.object({ serverId: z.string() }))
      .handle({
        async create({ input, ctx }) {
          return { id: `snap-${input.serverId}`, user: ctx.userId };
        },
      });

    assert.ok(snapshot.schema);
    assert.ok(snapshot.handlers.create);
  });
});

describe("platform builder", () => {
  it("defines a platform resource with base schema", () => {
    const t = initProvider<TestCtx>();

    const server = t.platform.server.handle({
      async create({ input }) {
        return { id: `srv-${input.name}`, size: input.size };
      },
    });

    assert.ok(server.schema);
    assert.ok(server.handlers.create);
  });

  it("extends platform resource with provider-specific input", () => {
    const t = initProvider<TestCtx>();

    const server = t.platform.server
      .input(z.object({ region: z.string() }))
      .handle({
        async create({ input }) {
          return {
            name: input.name,
            size: input.size,
            region: input.provider.region,
          };
        },
      });

    assert.ok(server.schema);
    assert.ok(server.handlers.create);
  });
});

describe("createProvider", () => {
  it("creates a provider with platform and resources", () => {
    const t = initProvider<TestCtx>();

    const server = t.platform.server.handle({
      async create({ input }) {
        return { id: input.name };
      },
    });

    const volume = t.platform.volume.handle({
      async create({ input }) {
        return { id: `vol-${input.size}` };
      },
    });

    const network = t.platform.network.handle({
      async create({ input }) {
        return { id: input.cidr };
      },
    });

    const snapshot = t.resource
      .input(z.object({ serverId: z.string() }))
      .handle({
        async create({ input }) {
          return { id: input.serverId };
        },
      });

    const provider = createProvider({
      context: async () => ({ userId: "test" }),
      platform: { server, volume, network },
      resources: { snapshot },
    });

    assert.ok(provider.config);
    assert.ok(provider.config.platform);
    assert.ok(provider.config.resources);
  });

  it("throws if platform is missing required resources", () => {
    const t = initProvider<TestCtx>();

    const server = t.platform.server.handle({
      async create({ input }) {
        return { id: input.name };
      },
    });

    assert.throws(() => {
      createProvider({
        context: async () => ({ userId: "test" }),
        // @ts-expect-error -- intentionally missing volume and network
        platform: { server },
        resources: {},
      });
    }, /missing required resources.*volume.*network/i);
  });

  it("creates a provider with only resources (no platform)", () => {
    const t = initProvider<TestCtx>();

    const glob = t.resource.input(z.object({ pattern: z.string() })).handle({
      async create({ input }) {
        return { matched: [input.pattern] };
      },
    });

    const provider = createProvider({
      context: async () => ({ userId: "test" }),
      resources: { glob },
    });

    assert.ok(provider.config);
    assert.equal(provider.config.platform, undefined);
  });
});
