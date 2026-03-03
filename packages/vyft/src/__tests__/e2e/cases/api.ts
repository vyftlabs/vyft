import { interpolate } from "@vyft/core";
import { config as cfg, service, volume } from "@vyft/platform";
import type { TestContext } from "../context.ts";

const data = volume("data");
const dbPassword = cfg("db-password", { secret: true });

const postgres = service("postgres", {
  image: "postgres:17",
  port: 5432,
  mounts: [{ source: data, path: "/var/lib/postgresql/data" }],
  env: { POSTGRES_DB: "appdb", POSTGRES_PASSWORD: dbPassword },
  health: { command: "pg_isready -U postgres", interval: "3s", retries: 5 },
});

const redis = service("redis", {
  image: "redis:7-alpine",
  port: 6379,
  health: { command: "redis-cli ping | grep PONG", interval: "3s", retries: 5 },
});

const instance = service("instance", {
  image: "alpine:latest",
  command: ["sh", "-c", "sleep 3600"],
  env: {
    POSTGRES_URL: interpolate`postgres://postgres:${dbPassword}@${postgres.host}:5432/appdb`,
    REDIS_URL: `redis://redis:6379`,
  },
  dependsOn: [postgres, redis],
});

export const config = {
  data,
  dbPassword,
  postgres,
  redis,
  instance,
};

export async function check(t: TestContext) {
  t.resourceCount(5);
  t.serviceOutputs("postgres", { host: "postgres", port: 5432 });
  t.serviceOutputs("redis", { host: "redis", port: 6379 });

  await t.serviceReady("postgres");
  await t.serviceReady("redis");
  await t.serviceReady("instance");
}
