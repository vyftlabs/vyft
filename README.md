# Vyft

Deploy apps with TypeScript. Define services, cron jobs, secrets, and volumes as code — then deploy to any runtime.

```ts
import { service, secret, volume } from "vyft";

const db = secret("db-password");
const data = volume("pgdata");

service("db", {
  image: "postgres:17",
  port: 5432,
  env: { POSTGRES_PASSWORD: db },
  mounts: [{ volume: data, path: "/var/lib/postgresql/data" }],
});

service("api", {
  build: "./apps/api",
  route: "api.example.com",
  env: { DATABASE_URL: `postgres://postgres:${db}@db:5432/app` },
  dependsOn: [db],
});
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
