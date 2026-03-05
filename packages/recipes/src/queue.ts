/**
 * Default queue implementation using RabbitMQ.
 * Used when the platform doesn't provide native message queues (e.g., SQS).
 *
 * Each queue() call creates a separate RabbitMQ instance for isolation.
 */

import { type Interpolation, interpolate } from "@vyft/core";
import { resource, service, volume } from "@vyft/primitives";
import { crypto } from "@vyft/std";

export interface QueueOptions {
  /** Volume size for persistence (default: "5Gi") */
  size?: string;
}

export interface QueueResult {
  /** AMQP connection URL */
  url: Interpolation;
  /** Service host */
  host: string;
  /** AMQP port */
  port: number;
  /** Queue name */
  name: string;
}

/**
 * Create a message queue using RabbitMQ.
 *
 * Each call creates a dedicated RabbitMQ instance (not shared).
 *
 * @example
 * ```ts
 * const mq = queue("tasks");
 * const worker = service("worker", {
 *   env: { RABBITMQ_URL: mq.url },
 *   dependsOn: [mq],
 * });
 * ```
 */
export const queue = resource("queue", (id, opts?: QueueOptions) => {
  const size = opts?.size ?? "5Gi";

  const password = crypto.randomString({ length: 32 });
  const data = volume("data", { size });

  const svc = service(id, {
    image: "rabbitmq:3-management-alpine",
    port: 5672,
    env: {
      RABBITMQ_DEFAULT_USER: "vyft",
      RABBITMQ_DEFAULT_PASS: password.result,
    },
    mounts: [{ source: data, path: "/var/lib/rabbitmq" }],
  });

  return {
    outputs: {
      url: interpolate`amqp://vyft:${password.result}@${svc.host}:5672`,
      host: svc.host,
      port: 5672,
      name: id,
    },
    ready: svc,
  };
});
