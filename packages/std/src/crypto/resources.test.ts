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
  test("generates string of requested length with default alphabet", async () => {
    const input = { length: 32 };
    const result = (await randomString.handlers.create?.({
      input,
      ctx,
      artifacts,
    })) as { result: string };
    assert.equal(result.result.length, 32);
    assert.match(result.result, /^[a-zA-Z0-9]+$/);
  });

  test("generates string with custom alphabet", async () => {
    const input = { length: 16, alphabet: "abc" };
    const result = (await randomString.handlers.create?.({
      input,
      ctx,
      artifacts,
    })) as { result: string };
    assert.equal(result.result.length, 16);
    assert.match(result.result, /^[abc]+$/);
  });

  test("respects boolean flags", async () => {
    const input = {
      length: 64,
      lowercase: true,
      numbers: false,
      uppercase: false,
    };
    const result = (await randomString.handlers.create?.({
      input,
      ctx,
      artifacts,
    })) as { result: string };
    assert.equal(result.result.length, 64);
    assert.match(result.result, /^[a-z]+$/);
  });

  test("includes special characters when requested", async () => {
    const input = { length: 200, special: true, lowercase: true };
    const result = (await randomString.handlers.create?.({
      input,
      ctx,
      artifacts,
    })) as { result: string };
    assert.equal(result.result.length, 200);
    assert.match(result.result, /[^a-zA-Z0-9]/);
  });
});

// ── sshKeyPair ──────────────────────────────────────────────────────────

describe("sshKeyPair", () => {
  test("generates ed25519 key pair", async () => {
    const input = { type: "ed25519" } as const;
    const result = (await sshKeyPair.handlers.create?.({
      input,
      ctx,
      artifacts,
    })) as { privateKeyPem: string; publicKeyPem: string; fingerprint: string };
    assert.ok(result.privateKeyPem.includes("BEGIN PRIVATE KEY"));
    assert.ok(result.publicKeyPem.includes("BEGIN PUBLIC KEY"));
    assert.ok(result.fingerprint.startsWith("SHA256:"));
  });

  test("generates RSA key pair", async () => {
    const input = { type: "rsa", rsaBits: 2048 } as const;
    const result = (await sshKeyPair.handlers.create?.({
      input,
      ctx,
      artifacts,
    })) as { privateKeyPem: string; publicKeyPem: string; fingerprint: string };
    assert.ok(result.privateKeyPem.includes("BEGIN PRIVATE KEY"));
    assert.ok(result.publicKeyPem.includes("BEGIN PUBLIC KEY"));
    assert.ok(result.fingerprint.startsWith("SHA256:"));
  });
});

// ── randomUuid ──────────────────────────────────────────────────────────

describe("randomUuid", () => {
  test("generates a valid UUID v4", async () => {
    const input = {};
    const result = (await randomUuid.handlers.create?.({
      input,
      ctx,
      artifacts,
    })) as { result: string };
    assert.match(
      result.result,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  test("generates unique values", async () => {
    const input = {};
    const a = (await randomUuid.handlers.create?.({
      input,
      ctx,
      artifacts,
    })) as { result: string };
    const b = (await randomUuid.handlers.create?.({
      input,
      ctx,
      artifacts,
    })) as { result: string };
    assert.notEqual(a.result, b.result);
  });
});

// ── randomInteger ───────────────────────────────────────────────────────

describe("randomInteger", () => {
  test("generates integer within range", async () => {
    const input = { min: 10, max: 20 };
    const result = (await randomInteger.handlers.create?.({
      input,
      ctx,
      artifacts,
    })) as { result: number };
    assert.ok(result.result >= 10);
    assert.ok(result.result <= 20);
    assert.equal(result.result, Math.floor(result.result));
  });
});

// ── randomBytes ─────────────────────────────────────────────────────────

describe("randomBytes", () => {
  test("generates hex-encoded bytes by default", async () => {
    const input = { length: 16 };
    const result = (await randomBytes.handlers.create?.({
      input,
      ctx,
      artifacts,
    })) as { result: string };
    assert.equal(result.result.length, 32);
    assert.match(result.result, /^[0-9a-f]+$/);
  });

  test("generates base64-encoded bytes", async () => {
    const input = { length: 16, encoding: "base64" } as const;
    const result = (await randomBytes.handlers.create?.({
      input,
      ctx,
      artifacts,
    })) as { result: string };
    assert.match(result.result, /^[A-Za-z0-9+/=]+$/);
  });
});
