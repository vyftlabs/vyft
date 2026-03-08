---
title: Template
description: Render Handlebars templates.
---

```typescript
import { std } from "vyft";

export const nginx = std.fs.template("nginx", {
  source: "./nginx.conf.hbs",
  vars: {
    port: "3000",
    domain: "example.com",
  },
});
```

Or use inline content:

```typescript
export const config = std.fs.template("config", {
  content: "PORT={{port}}",
  vars: { port: "8080" },
});
```

## Args

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `source` | `string` | — | Path to template file |
| `content` | `string` | — | Inline template string |
| `vars` | `Record<string, string>` | **required** | Template variables |

One of `source` or `content` must be provided.

## Output

- `content` — rendered template
- `sha256` — content hash
