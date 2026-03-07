export type { PlatformConfig } from "./define.ts";
export { definePlatform, PLATFORM_PROVIDER_NAME } from "./define.ts";
export type {
  BucketOutput,
  NetworkOutput,
  PostgresOutput,
  QueueOutput,
  SecretOutput,
  ServerOutput,
  VolumeOutput,
} from "./outputs.ts";
export type {
  BucketInput,
  NetworkInput,
  PostgresInput,
  QueueInput,
  SecretInput,
  ServerInput,
  VolumeInput,
} from "./schemas.ts";
export { postgres, redis, site } from "./resources/platform.ts";
export type { PostgresArgs } from "./resources/postgres.ts";
export type { RedisArgs } from "./resources/redis.ts";
export type { SiteArgs } from "./resources/site.ts";
