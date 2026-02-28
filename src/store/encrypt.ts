import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import type { EncryptedPayload } from "./types.ts";

const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const ALGORITHM = "aes-256-gcm";

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, KEY_LENGTH) as Buffer;
}

/** Encrypt plaintext with AES-256-GCM using a scrypt-derived key. */
export function encrypt(
  plaintext: string,
  passphrase: string,
): EncryptedPayload {
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = deriveKey(passphrase, salt);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    data: encrypted.toString("base64"),
    tag: tag.toString("base64"),
  };
}

/** Decrypt an AES-256-GCM payload. Throws on wrong passphrase (GCM auth failure). */
export function decrypt(payload: EncryptedPayload, passphrase: string): string {
  const salt = Buffer.from(payload.salt, "base64");
  const iv = Buffer.from(payload.iv, "base64");
  const data = Buffer.from(payload.data, "base64");
  const tag = Buffer.from(payload.tag, "base64");
  const key = deriveKey(passphrase, salt);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data) + decipher.final("utf8");
}
