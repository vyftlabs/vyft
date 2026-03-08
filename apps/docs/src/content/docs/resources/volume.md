---
title: Volume
description: Persistent storage for services.
---

A volume provides persistent storage that survives container restarts.

```typescript
import { service, volume } from "vyft";

const data = volume("data", { size: "10GB" });

export const app = service("app", {
  image: "node:22",
  port: 3000,
  mounts: [{ source: data, target: "/data" }],
});
```

## Configuration

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `size` | `string` | — | Volume size |
