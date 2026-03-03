import { interpolate } from "@vyft/core";
import { service } from "@vyft/platform";
import type { TestContext } from "../context.ts";

const redis = service("redis", {
  image: "redis:7-alpine",
  port: 6379,
  health: { command: "redis-cli ping | grep PONG", interval: "3s", retries: 5 },
});

const app = service("app", {
  image: "alpine:latest",
  command: ["sh", "-c", "sleep 3600"],
  env: { REDIS_URL: interpolate`redis://${redis.host}:${redis.port}` },
  dependsOn: [redis],
});

export const config = { redis, app };

export async function check(t: TestContext) {
  t.resourceCount(2);
  t.serviceOutputs("redis", { host: "redis", port: 6379 });

  await t.serviceReady("redis");
  await t.serviceReady("app");
}
