# Vyft

Deploy apps with TypeScript. Define services, cron jobs, secrets, and volumes as code — then deploy to any runtime.

```ts
// vyft.config.ts

import { service } from "vyft";
import { postgres } from "vyft/services";

const db = postgres("db");

export const api = service("api", {
  domain: "api.example.com",
  replicas: 2,
  link: [db],
});

// index.ts

import { Hono } from "hono";
import postgres from "postgres";
import { db } from "vyft/resource";

const sql = postgres(db.url);
const app = new Hono();

app.get("/", async (c) => {
  const users = await sql`SELECT * FROM users`;
  return c.json(users);
});

export default app;
```

## Install

```sh
npm install vyft
```

## Packages

| Package | Description |
| --- | --- |
| `vyft` | CLI and SDK |
| `@vyft/core` | Shared primitives and validation |
| `@vyft/provider` | Provider interface for building custom providers |
| `@vyft/platform` | Platform resource abstractions |
| `@vyft/docker` | Docker runtime |
| `@vyft/swarm` | Docker Swarm runtime |
| `@vyft/hcloud` | Hetzner Cloud provider |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[Apache-2.0](LICENSE)
