/** AES-256-GCM encrypted payload with scrypt-derived key. All fields are base64. */
export interface EncryptedPayload {
  readonly salt: string;
  readonly iv: string;
  readonly data: string;
  readonly tag: string;
}
