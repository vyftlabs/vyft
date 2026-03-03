/**
 * Default queue implementation using RabbitMQ.
 * Used when the platform doesn't provide native message queues (e.g., SQS).
 *
 * Each queue() call creates a separate RabbitMQ instance for isolation.
 */

import { config, service, volume } from "../index.ts";

export interface QueueOptions {
  /** Volume size for persistence (default: "5Gi") */
  size?: string;
}

export interface QueueResult {
  /** The RabbitMQ service */
  svc: ReturnType<typeof service>;
  /** The data volume */
  data: ReturnType<typeof volume>;
  /** Generated password config */
  password: ReturnType<typeof config>;
  /** AMQP connection URL */
  url: string;
  /** Queue name */
  name: string;
  /** Service host */
  host: string;
  /** AMQP port */
  port: number;
  /** Management UI port */
  managementPort: number;
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
 *   dependsOn: [mq.svc],
 * });
 * ```
 */
export function queue(name: string, opts?: QueueOptions): QueueResult {
  const size = opts?.size ?? "5Gi";

  // Namespace with vyft- prefix to avoid conflicts with user resources
  const id = `vyft-rabbitmq-${name}`;

  const password = config(`${id}-password`, { secret: true, length: 32 });
  const data = volume(`${id}-data`, { size });

  const svc = service(id, {
    image: "rabbitmq:3-management-alpine",
    port: 5672,
    env: {
      RABBITMQ_DEFAULT_USER: "vyft",
      RABBITMQ_DEFAULT_PASS: password,
    },
    mounts: [{ source: data, path: "/var/lib/rabbitmq" }],
  });

  return {
    svc,
    data,
    password,
    url: `amqp://vyft:${password}@${svc.host}:5672`,
    name,
    host: svc.host,
    port: 5672,
    managementPort: 15672,
  };
}
