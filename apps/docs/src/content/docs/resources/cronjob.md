---
title: Cron Job
description: Run scheduled tasks.
---

A cron job runs on a schedule using standard cron expressions.

```typescript
import { cronjob } from "vyft";

export const backup = cronjob("backup", {
  schedule: "0 2 * * *", // daily at 2am
  image: "node:22",
  command: ["node", "backup.js"],
});
```

## Configuration

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `schedule` | `string` | **required** | Cron expression |
| `image` | `string` | — | Docker image |
| `path` | `string` | — | Path to build from source |
| `cwd` | `string` | — | Working directory |
| `command` | `string[]` | — | Command to run |
| `env` | `Record<string, string>` | — | Environment variables |
| `mounts` | `Array<{ source, target }>` | — | Volume mounts |
| `health` | `object` | — | Health check configuration |
| `restart` | `string` | — | Restart policy |
