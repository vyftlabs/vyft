---
title: Glob
description: Match and archive files.
---

Match files with glob patterns and bundle them into a tar.gz archive.

```typescript
import { std } from "vyft";

export const source = std.fs.glob("source", {
  include: ["src/**/*.ts", "package.json", "tsconfig.json"],
  exclude: ["**/*.test.ts"],
});
```

## Args

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `include` | `string[]` | **required** | Glob patterns to include |
| `exclude` | `string[]` | — | Glob patterns to exclude |

## Output

- `archive` — tar.gz archive of matched files
- `files` — array of matched files with path, sha256, and size
- `count` — number of matched files
