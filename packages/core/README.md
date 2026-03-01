# @vyft/core

Core primitives for defining infrastructure resources.

## Usage

```ts
import { config, service, cronjob, volume } from "@vyft/core";

const db = volume("db-data", { driver: "local" });

const api = service("api", {
  image: "node:22",
  ports: [{ published: 3000, target: 3000 }],
  volumes: [{ source: db, target: "/data" }],
});

const backup = cronjob("backup", {
  image: "alpine",
  schedule: "0 2 * * *",
  command: ["sh", "-c", "backup.sh"],
});

const token = config("api-token", { secret: true, length: 32 });
```

## Exports

- `service(id, config)` — long-running container
- `cronjob(id, config)` — scheduled job
- `volume(id, config)` — persistent storage
- `config(id, opts?)` — configuration value (plain or secret)
- `site(id, opts)` — static site served by nginx
- Validators: `validateId`, `validateDuration`, `validateRoute`, `validateCron`
- Reference utilities: `interpolate`, `isReference`, `isInterpolation`
