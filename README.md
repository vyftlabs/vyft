# Vyft

> **WIP**: This project is under active development and not yet ready for production use.

Deploy apps with TypeScript. Define services, cron jobs, secrets, and volumes as code — then deploy to any runtime.

[![npm version](https://img.shields.io/npm/v/vyft)](https://www.npmjs.com/package/vyft)
[![CI](https://github.com/vyftlabs/vyft/actions/workflows/ci.yml/badge.svg)](https://github.com/vyftlabs/vyft/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/vyftlabs/vyft)](LICENSE)

## Overview

Vyft is an infrastructure-as-code framework that lets you define your entire deployment topology in TypeScript. Resources like databases, services, and cron jobs become typed objects in your codebase, and Vyft handles provisioning them across runtimes — from local Docker to cloud providers.

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

import { db } from "vyft/resource";
import { Hono } from "hono";
import postgres from "postgres";

const sql = postgres(db.url);

const app = new Hono();

app.get("/", async (c) => {
  const users = await sql`SELECT * FROM users`;
  return c.json(users);
});

export default app;
```

## Features

- **Infrastructure as code** — define services, databases, cron jobs, secrets, and volumes in TypeScript
- **Typed resources** — access connection strings, URLs, and credentials with full type safety
- **Multi-runtime** — deploy to Docker, Docker Swarm, Kubernetes, or Hetzner Cloud
- **Extensible providers** — build custom providers using the `@vyft/provider` interface

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 24+
- [pnpm](https://pnpm.io/) 10+

### Install

```sh
npm install vyft
```

## Packages

| Package | Description |
| --- | --- |
| [`vyft`](https://www.npmjs.com/package/vyft) | CLI and SDK |
| [`@vyft/core`](https://www.npmjs.com/package/@vyft/core) | Shared primitives and validation |
| [`@vyft/provider`](https://www.npmjs.com/package/@vyft/provider) | Provider interface for building custom providers |
| [`@vyft/platform`](https://www.npmjs.com/package/@vyft/platform) | Platform resource abstractions |
| [`@vyft/docker`](https://www.npmjs.com/package/@vyft/docker) | Docker runtime |
| [`@vyft/swarm`](https://www.npmjs.com/package/@vyft/swarm) | Docker Swarm runtime |
| [`@vyft/kubernetes`](https://www.npmjs.com/package/@vyft/kubernetes) | Kubernetes runtime |
| [`@vyft/hcloud`](https://www.npmjs.com/package/@vyft/hcloud) | Hetzner Cloud provider |

## Documentation

Visit [vyft.dev/docs](https://vyft.dev/docs) for guides and API reference.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[Apache-2.0](LICENSE)
