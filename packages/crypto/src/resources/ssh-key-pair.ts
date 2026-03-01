import crypto from "node:crypto";
import { defineResource } from "@vyft/provider";
import { z } from "zod";

import { context } from "../context.ts";

export const sshKeyPair = defineResource(
  {
    name: "sshKeyPair",
    context,
    config: z.object({
      type: z.enum(["ed25519", "rsa"]),
      rsaBits: z.number().int().min(2048).optional(),
    }),
    outputs: z.object({
      privateKeyPem: z.string(),
      publicKeyPem: z.string(),
      fingerprint: z.string(),
    }),
  },
  {
    async create(_id, config) {
      const keyType = config.type;

      let privateKeyPem: string;
      let publicKeyPem: string;

      if (keyType === "ed25519") {
        const pair = crypto.generateKeyPairSync("ed25519", {
          privateKeyEncoding: { type: "pkcs8", format: "pem" },
          publicKeyEncoding: { type: "spki", format: "pem" },
        });
        privateKeyPem = pair.privateKey;
        publicKeyPem = pair.publicKey;
      } else {
        const modulusLength = config.rsaBits ?? 4096;
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

      return {
        outputs: { privateKeyPem, publicKeyPem, fingerprint },
      };
    },

    async read() {
      return null;
    },
  },
);
