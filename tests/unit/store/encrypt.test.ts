import { notStrictEqual, strictEqual, throws } from "node:assert";
import { describe, it } from "node:test";
import { decrypt, encrypt } from "../../../src/store/encrypt.ts";

describe("encrypt / decrypt", () => {
  it("round-trips plaintext", () => {
    const payload = encrypt("hello world", "secret");
    strictEqual(decrypt(payload, "secret"), "hello world");
  });

  it("round-trips empty string", () => {
    const payload = encrypt("", "secret");
    strictEqual(decrypt(payload, "secret"), "");
  });

  it("round-trips unicode", () => {
    const text = "日本語テスト 🔑";
    const payload = encrypt(text, "secret");
    strictEqual(decrypt(payload, "secret"), text);
  });

  it("round-trips large plaintext", () => {
    const text = "x".repeat(100_000);
    const payload = encrypt(text, "secret");
    strictEqual(decrypt(payload, "secret"), text);
  });

  it("throws on wrong passphrase", () => {
    const payload = encrypt("hello", "correct");
    throws(() => decrypt(payload, "wrong"));
  });

  it("produces different ciphertexts for same plaintext (random salt)", () => {
    const a = encrypt("hello", "secret");
    const b = encrypt("hello", "secret");
    notStrictEqual(a.salt, b.salt);
    notStrictEqual(a.data, b.data);
  });

  it("all fields are base64 strings", () => {
    const payload = encrypt("test", "pass");
    const b64 = /^[A-Za-z0-9+/]+=*$/;
    for (const field of ["salt", "iv", "data", "tag"] as const) {
      strictEqual(typeof payload[field], "string");
      strictEqual(
        b64.test(payload[field]),
        true,
        `${field} is not valid base64`,
      );
    }
  });
});
