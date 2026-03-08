---
title: Crypto
description: Generate random values and keys.
---

## Random bytes

```typescript
import { std } from "vyft";

export const token = std.crypto.randomBytes("token", {
  length: 32,
  encoding: "hex",
});
```

| Field | Type | Description |
|-------|------|-------------|
| `length` | `number` | **required** — Number of bytes |
| `encoding` | `"hex" \| "base64"` | Output encoding |

## Random string

```typescript
export const password = std.crypto.randomString("password", {
  length: 24,
  alphabet: "abcdefghijklmnopqrstuvwxyz0123456789",
});
```

| Field | Type | Description |
|-------|------|-------------|
| `length` | `number` | **required** — String length |
| `alphabet` | `string` | Character set to use |

## Random integer

```typescript
export const pin = std.crypto.randomInteger("pin", {
  min: 100000,
  max: 999999,
});
```

| Field | Type | Description |
|-------|------|-------------|
| `min` | `number` | **required** — Minimum value |
| `max` | `number` | **required** — Maximum value |

## UUID

```typescript
export const id = std.crypto.randomUuid("id");
```

No arguments needed.

## SSH key pair

```typescript
export const key = std.crypto.sshKeyPair("key", {
  type: "ed25519",
});
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"ed25519" \| "rsa"` | **required** — Key type |
| `rsaBits` | `number` | RSA key size (default 4096) |

Output: `privateKeyPem`, `publicKeyPem`, `fingerprint`
