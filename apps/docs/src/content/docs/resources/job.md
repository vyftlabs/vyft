---
title: Job
description: Run one-time tasks.
---

A job runs a command once and exits — migrations, seed scripts, builds.

```typescript
import { job } from "vyft";

export const migrate = job("migrate", {
  image: "node:22",
  command: ["npx", "prisma", "migrate", "deploy"],
  env: {
    DATABASE_URL: "postgres://localhost:5432/app",
  },
});
```

## Configuration

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `image` | `string` | — | Docker image |
| `path` | `string` | — | Path to build from source |
| `cwd` | `string` | — | Working directory |
| `command` | `string[]` | — | Command to run |
| `env` | `Record<string, string>` | — | Environment variables |
| `mounts` | `Array<{ source, target }>` | — | Volume mounts |
