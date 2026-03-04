import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { INTERNAL } from "@vyft/provider";

import {
  randomBytes,
  randomInteger,
  randomString,
  randomUuid,
  sshKeyPair,
} from "./index.ts";

const id = { internal: "test-id" };
const ctx = {} as never;

// biome-ignore lint/suspicious/noExplicitAny: test helper to access internal definition
const def = (r: unknown) => (r as any)[INTERNAL];

// ── randomString ────────────────────────────────────────────────────────

describe("randomString", () => {
  test("generates string of requested length with default alphabet", async () => {
    const input = { length: 32 };
    const result = await def(randomString(input)).handler.create({
      id,
      input,
      ctx,
    });
    const output = "output" in result ? result.output : result;
    assert.equal(output.result.length, 32);
    assert.match(output.result, /^[a-zA-Z0-9]+$/);
  });

  test("generates string with custom alphabet", async () => {
    const input = { length: 16, alphabet: "abc" };
    const result = await def(randomString(input)).handler.create({
      id,
      input,
      ctx,
    });
    const output = "output" in result ? result.output : result;
    assert.equal(output.result.length, 16);
    assert.match(output.result, /^[abc]+$/);
  });

  test("respects boolean flags", async () => {
    const input = {
      length: 64,
      lowercase: true,
      numbers: false,
      uppercase: false,
    };
    const result = await def(randomString(input)).handler.create({
      id,
      input,
      ctx,
    });
    const output = "output" in result ? result.output : result;
    assert.equal(output.result.length, 64);
    assert.match(output.result, /^[a-z]+$/);
  });

  test("includes special characters when requested", async () => {
    const input = { length: 200, special: true, lowercase: true };
    const result = await def(randomString(input)).handler.create({
      id,
      input,
      ctx,
    });
    const output = "output" in result ? result.output : result;
    assert.equal(output.result.length, 200);
    assert.match(output.result, /[^a-zA-Z0-9]/);
  });
});

// ── sshKeyPair ──────────────────────────────────────────────────────────

describe("sshKeyPair", () => {
  test("generates ed25519 key pair", async () => {
    const input = { type: "ed25519" } as const;
    const result = await def(sshKeyPair(input)).handler.create({
      id,
      input,
      ctx,
    });
    const output = "output" in result ? result.output : result;
    assert.ok(output.privateKeyPem.includes("BEGIN PRIVATE KEY"));
    assert.ok(output.publicKeyPem.includes("BEGIN PUBLIC KEY"));
    assert.ok(output.fingerprint.startsWith("SHA256:"));
  });

  test("generates RSA key pair", async () => {
    const input = { type: "rsa", rsaBits: 2048 } as const;
    const result = await def(sshKeyPair(input)).handler.create({
      id,
      input,
      ctx,
    });
    const output = "output" in result ? result.output : result;
    assert.ok(output.privateKeyPem.includes("BEGIN PRIVATE KEY"));
    assert.ok(output.publicKeyPem.includes("BEGIN PUBLIC KEY"));
    assert.ok(output.fingerprint.startsWith("SHA256:"));
  });
});

// ── randomUuid ──────────────────────────────────────────────────────────

describe("randomUuid", () => {
  test("generates a valid UUID v4", async () => {
    const input = {};
    const result = await def(randomUuid(input)).handler.create({
      id,
      input,
      ctx,
    });
    const output = "output" in result ? result.output : result;
    assert.match(
      output.result,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  test("generates unique values", async () => {
    const input = {};
    const a = await def(randomUuid(input)).handler.create({ id, input, ctx });
    const b = await def(randomUuid(input)).handler.create({ id, input, ctx });
    const outputA = "output" in a ? a.output : a;
    const outputB = "output" in b ? b.output : b;
    assert.notEqual(outputA.result, outputB.result);
  });
});

// ── randomInteger ───────────────────────────────────────────────────────

describe("randomInteger", () => {
  test("generates integer within range", async () => {
    const input = { min: 10, max: 20 };
    const result = await def(randomInteger(input)).handler.create({
      id,
      input,
      ctx,
    });
    const output = "output" in result ? result.output : result;
    assert.ok(output.result >= 10);
    assert.ok(output.result <= 20);
    assert.equal(output.result, Math.floor(output.result));
  });
});

// ── randomBytes ─────────────────────────────────────────────────────────

describe("randomBytes", () => {
  test("generates hex-encoded bytes by default", async () => {
    const input = { length: 16 };
    const result = await def(randomBytes(input)).handler.create({
      id,
      input,
      ctx,
    });
    const output = "output" in result ? result.output : result;
    assert.equal(output.result.length, 32);
    assert.match(output.result, /^[0-9a-f]+$/);
  });

  test("generates base64-encoded bytes", async () => {
    const input = { length: 16, encoding: "base64" } as const;
    const result = await def(randomBytes(input)).handler.create({
      id,
      input,
      ctx,
    });
    const output = "output" in result ? result.output : result;
    assert.match(output.result, /^[A-Za-z0-9+/=]+$/);
  });
});
