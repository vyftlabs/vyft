import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Artifacts } from "@vyft/core";

import {
  randomBytes,
  randomInteger,
  randomString,
  randomUuid,
  sshKeyPair,
} from "./index.ts";

const ctx = {} as never;
const artifacts = {} as Artifacts;

// ── randomString ────────────────────────────────────────────────────────

describe("randomString", () => {
  const create = randomString.handlers.create;
  assert.ok(create);

  test("generates string of requested length with default alphabet", async () => {
    const input = { length: 32 };
    const { output } = await create({ input, ctx, artifacts });
    assert.equal(String(output["result"]).length, 32);
    assert.match(String(output["result"]), /^[a-zA-Z0-9]+$/);
  });

  test("generates string with custom alphabet", async () => {
    const input = { length: 16, alphabet: "abc" };
    const { output } = await create({ input, ctx, artifacts });
    assert.equal(String(output["result"]).length, 16);
    assert.match(String(output["result"]), /^[abc]+$/);
  });

  test("respects boolean flags", async () => {
    const input = {
      length: 64,
      lowercase: true,
      numbers: false,
      uppercase: false,
    };
    const { output } = await create({ input, ctx, artifacts });
    assert.equal(String(output["result"]).length, 64);
    assert.match(String(output["result"]), /^[a-z]+$/);
  });

  test("includes special characters when requested", async () => {
    const input = { length: 200, special: true, lowercase: true };
    const { output } = await create({ input, ctx, artifacts });
    assert.equal(String(output["result"]).length, 200);
    assert.match(String(output["result"]), /[^a-zA-Z0-9]/);
  });
});

// ── sshKeyPair ──────────────────────────────────────────────────────────

describe("sshKeyPair", () => {
  const create = sshKeyPair.handlers.create;
  assert.ok(create);

  test("generates ed25519 key pair", async () => {
    const input = { type: "ed25519" } as const;
    const { output } = await create({ input, ctx, artifacts });
    assert.ok(String(output["privateKeyPem"]).includes("BEGIN PRIVATE KEY"));
    assert.ok(String(output["publicKeyPem"]).includes("BEGIN PUBLIC KEY"));
    assert.ok(String(output["fingerprint"]).startsWith("SHA256:"));
  });

  test("generates RSA key pair", async () => {
    const input = { type: "rsa", rsaBits: 2048 } as const;
    const { output } = await create({ input, ctx, artifacts });
    assert.ok(String(output["privateKeyPem"]).includes("BEGIN PRIVATE KEY"));
    assert.ok(String(output["publicKeyPem"]).includes("BEGIN PUBLIC KEY"));
    assert.ok(String(output["fingerprint"]).startsWith("SHA256:"));
  });
});

// ── randomUuid ──────────────────────────────────────────────────────────

describe("randomUuid", () => {
  const create = randomUuid.handlers.create;
  assert.ok(create);

  test("generates a valid UUID v4", async () => {
    const input = {};
    const { output } = await create({ input, ctx, artifacts });
    assert.match(
      String(output["result"]),
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  test("generates unique values", async () => {
    const input = {};
    const a = await create({ input, ctx, artifacts });
    const b = await create({ input, ctx, artifacts });
    assert.notEqual(a.output["result"], b.output["result"]);
  });
});

// ── randomInteger ───────────────────────────────────────────────────────

describe("randomInteger", () => {
  const create = randomInteger.handlers.create;
  assert.ok(create);

  test("generates integer within range", async () => {
    const input = { min: 10, max: 20 };
    const { output } = await create({ input, ctx, artifacts });
    assert.ok(Number(output["result"]) >= 10);
    assert.ok(Number(output["result"]) <= 20);
    assert.equal(
      Number(output["result"]),
      Math.floor(Number(output["result"])),
    );
  });
});

// ── randomBytes ─────────────────────────────────────────────────────────

describe("randomBytes", () => {
  const create = randomBytes.handlers.create;
  assert.ok(create);

  test("generates hex-encoded bytes by default", async () => {
    const input = { length: 16 };
    const { output } = await create({ input, ctx, artifacts });
    assert.equal(String(output["result"]).length, 32);
    assert.match(String(output["result"]), /^[0-9a-f]+$/);
  });

  test("generates base64-encoded bytes", async () => {
    const input = { length: 16, encoding: "base64" } as const;
    const { output } = await create({ input, ctx, artifacts });
    assert.match(String(output["result"]), /^[A-Za-z0-9+/=]+$/);
  });
});
