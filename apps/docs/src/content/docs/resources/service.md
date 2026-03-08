---
title: Service
description: Deploy long-running services.
---

A service is a long-running process — your API server, web app, or worker.

```typescript
import { service } from "vyft";

export const api = service("api", {
  image: "node:22",
  port: 3000,
  domain: "api.example.com",
  env: {
    NODE_ENV: "production",
  },
});
```

## Configuration

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `image` | `string` | — | Docker image |
| `path` | `string` | — | Path to build from source |
| `port` | `number` | — | Port the service listens on |
| `domain` | `string` | — | Domain to expose the service on |
| `env` | `Record<string, string>` | — | Environment variables |
| `command` | `string[]` | — | Override the container command |
| `mounts` | `Array<{ source, target }>` | — | Volume mounts |
| `health` | `object` | — | Health check configuration |
| `restart` | `string` | — | Restart policy: `always`, `on-failure`, `unless-stopped`, `no` |
| `expose` | `boolean` | — | Expose the service externally |
| `link` | `Linkable[]` | — | Link to other services or resources |

## Linking

Link services together to inject connection details as environment variables:

```typescript
const worker = service("worker", { image: "node:22", port: 8080 });

export const api = service("api", {
  port: 3000,
  link: [worker],
});
```

Linked resources inject `{NAME}_HOST`, `{NAME}_PORT`, and `{NAME}_URL` into the service's environment.

## Health checks

```typescript
export const api = service("api", {
  port: 3000,
  health: {
    path: "/health",
    interval: "30s",
    timeout: "5s",
    retries: 3,
  },
});
```
