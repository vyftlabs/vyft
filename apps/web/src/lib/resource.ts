import type { AppSpec, PostgresSpec, RedisSpec, Resource } from "@vyft/spec";

export function getAppSpec(r: Resource): AppSpec | null {
  if (r.config.kind !== "app") return null;
  return r.config.spec;
}

export function getPostgresSpec(r: Resource): PostgresSpec | null {
  if (r.config.kind !== "postgres") return null;
  return r.config.spec;
}

export function getRedisSpec(r: Resource): RedisSpec | null {
  if (r.config.kind !== "redis") return null;
  return r.config.spec;
}
