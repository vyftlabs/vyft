/**
 * Default implementations for optional platform resources.
 *
 * These use runtime primitives (service, volume, config) to create
 * container-based alternatives when the platform doesn't
 * provide native implementations.
 *
 * @example
 * ```ts
 * import { postgres, bucket, queue } from "@vyft/platform/defaults";
 * import { service } from "@vyft/platform";
 *
 * const db = postgres("main");
 * const storage = bucket("uploads");
 * const mq = queue("tasks");
 *
 * const api = service("api", {
 *   dependsOn: [db.svc, storage.svc, mq.svc],
 *   env: {
 *     DATABASE_URL: db.url,
 *     S3_ENDPOINT: storage.endpoint,
 *     S3_BUCKET: storage.name,
 *     RABBITMQ_URL: mq.url,
 *   },
 * });
 * ```
 */

export { type BucketOptions, type BucketResult, bucket } from "./bucket.ts";
export {
  type PostgresOptions,
  type PostgresResult,
  postgres,
} from "./postgres.ts";
export { type QueueOptions, type QueueResult, queue } from "./queue.ts";
