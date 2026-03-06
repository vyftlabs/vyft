import * as crypto from "node:crypto";

export const SECRET: unique symbol = Symbol("vyft.secret");

export interface EncryptedSecret {
  kind: "secret";
  ciphertext: string;
  alg: string;
  iv: string;
  tag: string;
}

interface SecretValue<T> {
  [SECRET]: true;
  value: T;
}

function wrapSecret<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    Object.defineProperty(value, SECRET, {
      value: true,
      enumerable: false,
      configurable: false,
    });
    return value;
  }

  const wrapper = Object(value) as SecretValue<T>;
  Object.defineProperty(wrapper, SECRET, {
    value: true,
    enumerable: false,
    configurable: false,
  });
  Object.defineProperty(wrapper, "value", {
    value,
    enumerable: false,
    configurable: false,
  });
  return wrapper as unknown as T;
}

function taggedTemplate(
  strings: TemplateStringsArray,
  ...expressions: unknown[]
): string {
  let result = "";
  for (let i = 0; i < strings.length; i++) {
    result += strings[i];
    if (i < expressions.length) {
      const expr = expressions[i];
      result += String(isSecret(expr) ? unwrap(expr) : expr);
    }
  }
  return wrapSecret(result) as unknown as string;
}

export function secret<T>(value: T): T;
export function secret(
  strings: TemplateStringsArray,
  ...expressions: unknown[]
): string;
export function secret(first: unknown, ...rest: unknown[]): unknown {
  if (
    typeof first === "object" &&
    first !== null &&
    "raw" in first &&
    Array.isArray((first as TemplateStringsArray).raw)
  ) {
    return taggedTemplate(first as TemplateStringsArray, ...rest);
  }
  return wrapSecret(first);
}

export function isSecret(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    SECRET in value &&
    (value as Record<symbol, unknown>)[SECRET] === true
  );
}

export function unwrap<T>(value: T): T {
  if (!isSecret(value)) return value;
  const wrapper = value as unknown as SecretValue<T>;
  if (
    "value" in wrapper &&
    !Object.prototype.propertyIsEnumerable.call(wrapper, "value")
  ) {
    return wrapper.value;
  }
  return value;
}

// ── Cipher ──────────────────────────────────────────────────────────────

export function generateSalt(): Buffer {
  return crypto.randomBytes(16);
}

const SCRYPT_COST = 32768;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;

export class Cipher {
  readonly #key: Buffer;

  constructor(passphrase: string, salt: Buffer) {
    this.#key = crypto.scryptSync(passphrase, salt, 32, {
      N: SCRYPT_COST,
      r: SCRYPT_BLOCK_SIZE,
      p: SCRYPT_PARALLELIZATION,
      maxmem: 128 * SCRYPT_COST * SCRYPT_BLOCK_SIZE * 2,
    });
  }

  async encrypt(plaintext: string): Promise<EncryptedSecret> {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.#key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    return {
      kind: "secret",
      ciphertext: encrypted.toString("base64"),
      alg: "aes-256-gcm",
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
    };
  }

  async decrypt(encrypted: EncryptedSecret): Promise<string> {
    if (encrypted.alg !== "aes-256-gcm") {
      throw new Error(`Unsupported algorithm: ${encrypted.alg}`);
    }
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      this.#key,
      Buffer.from(encrypted.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  }
}
