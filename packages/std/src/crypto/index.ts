import crypto from "node:crypto";
import { z } from "zod";
import { t } from "../provider.ts";

/**
 * Generate cryptographically secure random bytes.
 *
 * @example
 * ```ts
 * std.crypto.randomBytes({ length: 32 })
 * std.crypto.randomBytes({ length: 16, encoding: "base64" })
 * ```
 */
export const randomBytes = t.resource
  .input(
    z.object({
      length: z.number().int().min(1).describe("Number of bytes to generate"),
      encoding: z
        .enum(["hex", "base64"])
        .optional()
        .describe("Output encoding"),
    }),
  )
  .handle({
    async create({ input }) {
      const encoding = input.encoding ?? "hex";
      const result = crypto.randomBytes(input.length).toString(encoding);
      return { output: { result } };
    },
  });

/**
 * Generate a random string with configurable alphabet.
 *
 * @example
 * ```ts
 * std.crypto.randomString({ length: 32 })
 * std.crypto.randomString({ length: 16, numbers: true, lowercase: false, uppercase: false })
 * std.crypto.randomString({ length: 8, alphabet: "abc123" })
 * ```
 */
export const randomString = t.resource
  .input(
    z.object({
      length: z.number().int().min(1).describe("Length of the string"),
      alphabet: z.string().optional().describe("Custom alphabet to use"),
      uppercase: z.boolean().optional().describe("Include uppercase letters"),
      lowercase: z.boolean().optional().describe("Include lowercase letters"),
      numbers: z.boolean().optional().describe("Include numbers"),
      special: z.boolean().optional().describe("Include special characters"),
    }),
  )
  .handle({
    async create({ input }) {
      let alphabet = input.alphabet;
      if (alphabet === undefined) {
        alphabet = "";
        if (input.uppercase ?? true) alphabet += "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        if (input.lowercase ?? true) alphabet += "abcdefghijklmnopqrstuvwxyz";
        if (input.numbers ?? true) alphabet += "0123456789";
        if (input.special ?? false) alphabet += "!@#$%^&*()_+-=[]{}|;:,.<>?";
      }

      let result = "";
      const bytes = crypto.randomBytes(input.length);
      for (const byte of bytes) {
        result += alphabet[byte % alphabet.length];
      }
      return { output: { result } };
    },
  });

/**
 * Generate a cryptographically secure random integer.
 *
 * @example
 * ```ts
 * std.crypto.randomInteger({ min: 1, max: 100 })
 * ```
 */
export const randomInteger = t.resource
  .input(
    z.object({
      min: z.number().int().describe("Minimum value (inclusive)"),
      max: z.number().int().describe("Maximum value (inclusive)"),
    }),
  )
  .handle({
    async create({ input }) {
      const range = input.max - input.min + 1;
      const result = input.min + crypto.randomInt(range);
      return { output: { result } };
    },
  });

/**
 * Generate a random UUID v4.
 *
 * @example
 * ```ts
 * std.crypto.randomUuid({})
 * ```
 */
export const randomUuid = t.resource.input(z.object({})).handle({
  async create() {
    const result = crypto.randomUUID();
    return { output: { result } };
  },
});

/**
 * Generate an SSH key pair.
 *
 * @example
 * ```ts
 * std.crypto.sshKeyPair({ type: "ed25519" })
 * std.crypto.sshKeyPair({ type: "rsa", rsaBits: 4096 })
 * ```
 */
export const sshKeyPair = t.resource
  .input(
    z.object({
      type: z.enum(["ed25519", "rsa"]).describe("Key type"),
      rsaBits: z
        .number()
        .int()
        .min(2048)
        .optional()
        .describe("RSA key size in bits"),
    }),
  )
  .handle({
    async create({ input }) {
      let privateKeyPem: string;
      let publicKeyPem: string;

      if (input.type === "ed25519") {
        const pair = crypto.generateKeyPairSync("ed25519", {
          privateKeyEncoding: { type: "pkcs8", format: "pem" },
          publicKeyEncoding: { type: "spki", format: "pem" },
        });
        privateKeyPem = pair.privateKey;
        publicKeyPem = pair.publicKey;
      } else {
        const modulusLength = input.rsaBits ?? 4096;
        const pair = crypto.generateKeyPairSync("rsa", {
          modulusLength,
          privateKeyEncoding: { type: "pkcs8", format: "pem" },
          publicKeyEncoding: { type: "spki", format: "pem" },
        });
        privateKeyPem = pair.privateKey;
        publicKeyPem = pair.publicKey;
      }

      const publicKeyDer = crypto
        .createPublicKey(publicKeyPem)
        .export({ type: "spki", format: "der" });

      const hash = crypto
        .createHash("sha256")
        .update(publicKeyDer)
        .digest("base64");
      const fingerprint = `SHA256:${hash}`;

      return { output: { privateKeyPem, publicKeyPem, fingerprint } };
    },
  });
