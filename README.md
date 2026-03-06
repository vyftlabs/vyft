# Vyft

> **WIP**: This project is under active development and not yet ready for production use.

Deploy apps with TypeScript. Define services, databases, static sites, cron jobs, and more as code — then deploy to any runtime.

[![npm version](https://img.shields.io/npm/v/vyft)](https://www.npmjs.com/package/vyft)
[![CI](https://github.com/vyftlabs/vyft/actions/workflows/ci.yml/badge.svg)](https://github.com/vyftlabs/vyft/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/vyftlabs/vyft)](LICENSE)

## Overview

Vyft is an infrastructure-as-code framework that lets you define your entire deployment topology in TypeScript. Resources like databases, services, and cron jobs become typed objects in your codebase, and Vyft handles provisioning them across runtimes — from local Docker to cloud providers.

```ts
// vyft.config.ts

import { service, postgres, site } from "vyft";

const db = postgres("db");

export const api = service("api", {
  domain: "api.example.com",
  replicas: 2,
  link: [db],
});

export const web = site("web", { path: "./apps/web", domain: "example.com" });

// index.ts

import { bindings } from "@vyft/client";
import { Hono } from "hono";
import postgres from "postgres";

const sql = postgres(bindings.db.url);

const app = new Hono();

app.get("/", async (c) => {
  const users = await sql`SELECT * FROM users`;
  return c.json(users);
});

export default app;
```

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 24+
- [pnpm](https://pnpm.io/) 10+

### Install

```sh
npm install -g vyft
```

## Documentation

Visit [vyft.dev/docs](https://vyft.dev/docs) for guides and API reference.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[Apache-2.0](LICENSE)
