import crypto from "node:crypto";
import { defineResource } from "@vyft/provider";

export interface RandomBytesArgs {
  length: number;
  encoding?: "hex" | "base64";
}

export const randomBytes = defineResource<RandomBytesArgs>("random_bytes", {
  async create({ input }) {
    const encoding = input.encoding ?? "hex";
    const result = crypto.randomBytes(input.length).toString(encoding);
    return { output: { result } };
  },
});

export interface RandomStringArgs {
  length: number;
  alphabet?: string;
  uppercase?: boolean;
  lowercase?: boolean;
  numbers?: boolean;
  special?: boolean;
}

export const randomString = defineResource<RandomStringArgs>("random_string", {
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

export interface RandomIntegerArgs {
  min: number;
  max: number;
}

export const randomInteger = defineResource<RandomIntegerArgs>(
  "random_integer",
  {
    async create({ input }) {
      const range = input.max - input.min + 1;
      const result = input.min + crypto.randomInt(range);
      return { output: { result } };
    },
  },
);

export const randomUuid = defineResource<Record<string, never>>("random_uuid", {
  async create() {
    const result = crypto.randomUUID();
    return { output: { result } };
  },
});

export interface SshKeyPairArgs {
  type: "ed25519" | "rsa";
  rsaBits?: number;
}

export const sshKeyPair = defineResource<SshKeyPairArgs>("ssh_key_pair", {
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
