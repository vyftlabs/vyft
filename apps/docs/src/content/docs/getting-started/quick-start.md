---
title: Quick Start
description: Deploy your first app with Vyft.
---

## Define your infrastructure

Edit `vyft.config.ts`:

```typescript
import { service } from "vyft";

export const app = service("app", {
  image: "node:22-alpine",
  port: 3000,
  env: {
    NODE_ENV: "production",
  },
});
```

## Preview changes

```bash
vyft preview
```

```
+ urn:vyft:resource:runtime:service:app  (create)
```

## Deploy

```bash
vyft deploy
```

## Tear down

```bash
vyft destroy
```
