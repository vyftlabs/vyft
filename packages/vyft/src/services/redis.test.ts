import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { service } from "@vyft/core";
import { redis } from "./redis.ts";

describe("redis()", () => {
  it("creates a service with default image", () => {
    const cache = redis("cache");
    strictEqual(cache.service.config.image, "redis:7-alpine");
  });

  it("creates a service on port 6379", () => {
    const cache = redis("cache");
    strictEqual(cache.service.port, 6379);
  });

  it("creates a volume for data", () => {
    const cache = redis("cache");
    strictEqual(cache.volume.id, "cache-data");
  });

  it("sets AOF persistence command", () => {
    const cache = redis("cache");
    strictEqual(cache.service.config.command, "redis-server --appendonly yes");
  });

  it("mounts volume at /data", () => {
    const cache = redis("cache");
    const mount = cache.service.config.mounts?.[0];
    strictEqual(mount?.path, "/data");
  });

  it("configures health check", () => {
    const cache = redis("cache");
    const health = cache.service.config.health;
    strictEqual(health?.command, "redis-cli ping | grep PONG");
    strictEqual(health?.interval, "5s");
    strictEqual(health?.retries, 5);
  });

  it("has bindable url, host, and port", () => {
    const cache = redis("cache");
    strictEqual(cache.url.kind, "binding");
    strictEqual(cache.url.value, "redis://cache:6379");
    strictEqual(cache.host.kind, "binding");
    strictEqual(cache.host.value, "cache");
    strictEqual(cache.port.kind, "binding");
    strictEqual(cache.port.value, 6379);
  });

  it("accepts custom image", () => {
    const cache = redis("cache", { image: "redis:6" });
    strictEqual(cache.service.config.image, "redis:6");
  });

  it("produces correct env vars when linked", () => {
    const cache = redis("cache");
    const api = service("api", {
      build: "./apps/api",
      link: [cache],
    });
    strictEqual(
      api.config.env?.["VYFT_BINDING_CACHE_URL"],
      "redis://cache:6379",
    );
    strictEqual(api.config.env?.["VYFT_BINDING_CACHE_HOST"], "cache");
    strictEqual(api.config.env?.["VYFT_BINDING_CACHE_PORT"], "6379");
    strictEqual(api.config.dependsOn?.[0]?.id, "cache");
  });

  it("is a valid Linkable", () => {
    const cache = redis("cache");
    strictEqual(cache.id, "cache");
    strictEqual(cache.service.kind, "service");
  });
});
