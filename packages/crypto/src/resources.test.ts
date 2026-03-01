import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { randomBytes } from "./resources/random-bytes.ts";
import { randomInteger } from "./resources/random-integer.ts";
import { randomString } from "./resources/random-string.ts";
import { randomUuid } from "./resources/random-uuid.ts";
import { sshKeyPair } from "./resources/ssh-key-pair.ts";

const id = { internal: "test-id" };
const ctx = {};

// ── randomString ────────────────────────────────────────────────────────

describe("randomString", () => {
  test("generates string of requested length with default alphabet", async () => {
    const { outputs } = await randomString.handler.create(
      id,
      { length: 32 },
      ctx,
    );
    assert.equal(outputs.result.length, 32);
    assert.match(outputs.result, /^[a-zA-Z0-9]+$/);
  });

  test("generates string with custom alphabet", async () => {
    const { outputs } = await randomString.handler.create(
      id,
      { length: 16, alphabet: "abc" },
      ctx,
    );
    assert.equal(outputs.result.length, 16);
    assert.match(outputs.result, /^[abc]+$/);
  });

  test("respects boolean flags", async () => {
    const { outputs } = await randomString.handler.create(
      id,
      { length: 64, lower: true, numeric: false, upper: false },
      ctx,
    );
    assert.equal(outputs.result.length, 64);
    assert.match(outputs.result, /^[a-z]+$/);
  });

  test("includes special characters when requested", async () => {
    const { outputs } = await randomString.handler.create(
      id,
      { length: 200, special: true, lower: true },
      ctx,
    );
    assert.equal(outputs.result.length, 200);
    // With 200 chars from lower+special, it's very likely to contain at least one special char
    assert.match(outputs.result, /[^a-zA-Z0-9]/);
  });

  test("read returns null", async () => {
    const result = await randomString.handler.read?.(id, ctx);
    assert.equal(result, null);
  });
});

// ── sshKeyPair ──────────────────────────────────────────────────────────

describe("sshKeyPair", () => {
  test("generates ed25519 key pair", async () => {
    const { outputs } = await sshKeyPair.handler.create(
      id,
      { type: "ed25519" },
      ctx,
    );
    assert.ok(outputs.privateKeyPem.includes("BEGIN PRIVATE KEY"));
    assert.ok(outputs.publicKeyPem.includes("BEGIN PUBLIC KEY"));
    assert.ok(outputs.fingerprint.startsWith("SHA256:"));
  });

  test("generates RSA key pair", async () => {
    const { outputs } = await sshKeyPair.handler.create(
      id,
      { type: "rsa", rsaBits: 2048 },
      ctx,
    );
    assert.ok(outputs.privateKeyPem.includes("BEGIN PRIVATE KEY"));
    assert.ok(outputs.publicKeyPem.includes("BEGIN PUBLIC KEY"));
    assert.ok(outputs.fingerprint.startsWith("SHA256:"));
  });

  test("read returns null", async () => {
    const result = await sshKeyPair.handler.read?.(id, ctx);
    assert.equal(result, null);
  });
});

// ── randomUuid ──────────────────────────────────────────────────────────

describe("randomUuid", () => {
  test("generates a valid UUID v4", async () => {
    const { outputs } = await randomUuid.handler.create(id, {}, ctx);
    assert.match(
      outputs.result,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  test("generates unique values", async () => {
    const a = await randomUuid.handler.create(id, {}, ctx);
    const b = await randomUuid.handler.create(id, {}, ctx);
    assert.notEqual(a.outputs.result, b.outputs.result);
  });

  test("read returns null", async () => {
    const result = await randomUuid.handler.read?.(id, ctx);
    assert.equal(result, null);
  });
});

// ── randomInteger ───────────────────────────────────────────────────────

describe("randomInteger", () => {
  test("generates integer within range", async () => {
    const { outputs } = await randomInteger.handler.create(
      id,
      { min: 10, max: 20 },
      ctx,
    );
    assert.ok(outputs.result >= 10);
    assert.ok(outputs.result < 20);
    assert.equal(outputs.result, Math.floor(outputs.result));
  });

  test("read returns null", async () => {
    const result = await randomInteger.handler.read?.(id, ctx);
    assert.equal(result, null);
  });
});

// ── randomBytes ─────────────────────────────────────────────────────────

describe("randomBytes", () => {
  test("generates hex-encoded bytes by default", async () => {
    const { outputs } = await randomBytes.handler.create(
      id,
      { length: 16 },
      ctx,
    );
    assert.equal(outputs.result.length, 32); // 16 bytes = 32 hex chars
    assert.match(outputs.result, /^[0-9a-f]+$/);
  });

  test("generates base64-encoded bytes", async () => {
    const { outputs } = await randomBytes.handler.create(
      id,
      { length: 16, encoding: "base64" },
      ctx,
    );
    assert.match(outputs.result, /^[A-Za-z0-9+/=]+$/);
  });

  test("read returns null", async () => {
    const result = await randomBytes.handler.read?.(id, ctx);
    assert.equal(result, null);
  });
});
