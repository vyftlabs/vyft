import { deepStrictEqual, strictEqual, throws } from "node:assert";
import { describe, it } from "node:test";
import type { SecretRef } from "../../../src/ref.ts";
import { interpolate } from "../../../src/ref.ts";
import { resolve, resolveEnv } from "../../../src/resolve.ts";

const secrets = new Map([
  ["db-pass", "s3cret"],
  ["api-key", "abc123"],
]);

describe("resolve", () => {
  it("returns plain strings as-is", () => {
    strictEqual(resolve("hello", secrets), "hello");
  });

  it("resolves a secret reference", () => {
    const ref: SecretRef = { kind: "secret", id: "db-pass" };
    strictEqual(resolve(ref, secrets), "s3cret");
  });

  it("throws on missing secret", () => {
    const ref: SecretRef = { kind: "secret", id: "missing" };
    throws(() => resolve(ref, secrets), /missing/);
  });

  it("resolves interpolation with mixed values", () => {
    const ref: SecretRef = { kind: "secret", id: "db-pass" };
    const value = interpolate`postgres://user:${ref}@db:5432/mydb`;
    strictEqual(resolve(value, secrets), "postgres://user:s3cret@db:5432/mydb");
  });

  it("resolves interpolation with only strings", () => {
    const value = interpolate`hello ${"world"}`;
    strictEqual(resolve(value, secrets), "hello world");
  });

  it("resolves interpolation with multiple secrets", () => {
    const a: SecretRef = { kind: "secret", id: "db-pass" };
    const b: SecretRef = { kind: "secret", id: "api-key" };
    const value = interpolate`${a}:${b}`;
    strictEqual(resolve(value, secrets), "s3cret:abc123");
  });

  it("resolves interpolation with no expressions", () => {
    const value = interpolate`static-string`;
    strictEqual(resolve(value, secrets), "static-string");
  });

  it("handles interpolation with trailing string segment", () => {
    const ref: SecretRef = { kind: "secret", id: "db-pass" };
    const value = interpolate`user:${ref}@host`;
    strictEqual(resolve(value, secrets), "user:s3cret@host");
  });
});

describe("resolveEnv", () => {
  it("returns empty object for empty env", () => {
    deepStrictEqual(resolveEnv({}, secrets), {});
  });

  it("resolves a full env record", () => {
    const ref: SecretRef = { kind: "secret", id: "db-pass" };
    const env = {
      PLAIN: "hello",
      SECRET: ref,
      URL: interpolate`pg://${ref}@db`,
    };
    deepStrictEqual(resolveEnv(env, secrets), {
      PLAIN: "hello",
      SECRET: "s3cret",
      URL: "pg://s3cret@db",
    });
  });
});
