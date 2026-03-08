---
title: Introduction
description: What is Vyft and why use it.
---

Vyft is an infrastructure-as-code framework for TypeScript. Define your services, volumes, and jobs as code — then deploy them with a single command.

```typescript
import { service, volume } from "vyft";

const data = volume("data");

export const api = service("api", {
  image: "node:22",
  port: 3000,
  mounts: [{ source: data, target: "/data" }],
});
```

```bash
vyft deploy
```

## Why Vyft?

- **TypeScript native** — your infrastructure is typed, autocompleted, and colocated with your app
- **Simple primitives** — services, jobs, volumes — no YAML, no DSLs
- **Single command deploys** — `vyft deploy` handles diffing, ordering, and execution
- **Portable** — deploy to Docker today, swap runtimes later
