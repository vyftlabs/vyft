# Vyft

Deploy apps with TypeScript. Define services, cron jobs, secrets, and volumes as code — then deploy to any runtime.

<table>
<tr>
<td>

```ts
// vyft.config.ts
import { service, secret, volume } from "vyft";

const dbPassword = secret("db-password");
const data = volume("pgdata");

export const db = service("db", {
  image: "postgres:17",
  port: 5432,
  env: { POSTGRES_PASSWORD: dbPassword },
  mounts: [{ volume: data, path: "/var/lib/postgresql/data" }],
});


```

</td>
<td>

```ts
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

</td>
</tr>
</table>

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
