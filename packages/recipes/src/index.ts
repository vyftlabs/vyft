// Capability shape types

// Recipe implementations
export { type BucketOptions, type BucketResult, bucket } from "./bucket.ts";
export {
  type PostgresOptions,
  type PostgresResult,
  postgres,
} from "./postgres.ts";
export { type QueueOptions, type QueueResult, queue } from "./queue.ts";
export type {
  BucketConfig,
  BucketState,
  PostgresConfig,
  PostgresState,
  QueueConfig,
  QueueState,
  SecretConfig,
  SecretState,
  ServerConfig,
  ServerState,
  VolumeConfig,
  VolumeState,
} from "./shapes.ts";
