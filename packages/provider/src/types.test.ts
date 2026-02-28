import { describe, test } from "node:test";
import { z } from "zod";
import { defineProviderContext } from "./context.ts";
import { VyftResourceError } from "./errors.ts";
import { defineModule, defineModuleShape } from "./module.ts";
import { defineResource } from "./resource.ts";
import type { ResourceId } from "./types.ts";

// ── Type testing utilities ───────────────────────────────────────────────

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;

function assert<_T extends true>() {}

// ── Fixtures ─────────────────────────────────────────────────────────────

const context = defineProviderContext({
  name: "test-provider",
  secrets: ["apiToken", "secretKey"],
  setup: ({ secrets }) => ({ client: { token: secrets.apiToken } }),
});

const Shape = defineModuleShape("test", {
  network: {
    config: z.object({ location: z.string() }),
    outputs: z.object({ publicIp: z.string() }),
  },
  server: {
    config: z.object({ type: z.string(), image: z.string().optional() }),
    outputs: z.object({ serverId: z.number(), ipv4: z.string() }),
  },
});

// ── defineProviderContext ────────────────────────────────────────────────

describe("defineProviderContext", () => {
  test("setup receives typed secrets", () => {
    defineProviderContext({
      name: "x",
      secrets: ["a", "b"],
      setup: ({ secrets }) => {
        assert<Equal<typeof secrets, { a: string; b: string }>>();
        return {};
      },
    });
  });
});

// ── defineResource (contract) ───────────────────────────────────────────

describe("defineResource with contract schema", () => {
  test("handler create receives ResourceId, inferred config, and inferred ctx", () => {
    defineResource(
      { context, schema: Shape.network },
      {
        async create(_id, _config, _ctx) {
          assert<Equal<typeof _id, ResourceId>>();
          assert<Equal<typeof _config, { location: string }>>();
          assert<Equal<typeof _ctx, { client: { token: string } }>>();
          return { outputs: { publicIp: "1.2.3.4" } };
        },
      },
    );
  });

  test("read, update, delete are optional", () => {
    defineResource(
      { context, schema: Shape.network },
      {
        async create(_id, _config, _ctx) {
          return { outputs: { publicIp: "1.2.3.4" } };
        },
      },
    );
  });

  test("wrong output type is a type error", () => {
    // @ts-expect-error — wrong output shape
    defineResource(
      { context, schema: Shape.network },
      {
        async create(_id, _config, _ctx) {
          return { outputs: { wrongField: "x" } };
        },
      },
    );
  });

  test("delete returns void, not HandlerResult", () => {
    defineResource(
      { context, schema: Shape.network },
      {
        async create(_id, _config, _ctx) {
          return { outputs: { publicIp: "1.2.3.4" } };
        },
        async delete(_id, _ctx) {
          // valid — returns void (implicitly)
        },
      },
    );
  });
});

// ── defineResource (standalone) ─────────────────────────────────────────

describe("defineResource standalone", () => {
  test("handler receives inferred types from inline schema", () => {
    defineResource(
      {
        name: "firewall",
        context,
        config: z.object({ rules: z.array(z.string()) }),
        outputs: z.object({ firewallId: z.number() }),
      },
      {
        async create(_id, _config, _ctx) {
          assert<Equal<typeof _id, ResourceId>>();
          assert<Equal<typeof _config, { rules: string[] }>>();
          assert<Equal<typeof _ctx, { client: { token: string } }>>();
          return { outputs: { firewallId: 1 } };
        },
      },
    );
  });
});

// ── defineModule ────────────────────────────────────────────────────────

describe("defineModule", () => {
  test("accepts resource definitions that match the shape", () => {
    const network = defineResource(
      { context, schema: Shape.network },
      {
        async create(_id, _config, _ctx) {
          return { outputs: { publicIp: "1.2.3.4" } };
        },
      },
    );

    const server = defineResource(
      { context, schema: Shape.server },
      {
        async create(_id, _config, _ctx) {
          return { outputs: { serverId: 1, ipv4: "1.2.3.4" } };
        },
      },
    );

    defineModule(Shape, { network, server });
  });

  test("missing resource key is a type error", () => {
    const network = defineResource(
      { context, schema: Shape.network },
      {
        async create(_id, _config, _ctx) {
          return { outputs: { publicIp: "1.2.3.4" } };
        },
      },
    );

    // @ts-expect-error — 'server' resource is missing
    defineModule(Shape, { network });
  });
});

// ── VyftResourceError ───────────────────────────────────────────────────

describe("VyftResourceError", () => {
  test("rejects invalid error codes", () => {
    // @ts-expect-error — 'INVALID_CODE' is not a valid ResourceErrorCode
    new VyftResourceError("res-1", "INVALID_CODE", "something broke");
  });

  test("accepts valid error codes", () => {
    new VyftResourceError("res-1", "NOT_FOUND", "not found");
    new VyftResourceError("res-1", "CONFLICT", "conflict");
    new VyftResourceError(undefined, "PROVIDER_ERROR", "api failed");
  });
});
