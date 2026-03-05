/**
 * Default PostgreSQL implementation using a container.
 * Used when the platform doesn't provide native postgres (e.g., RDS).
 */

import { type Interpolation, interpolate } from "@vyft/core";
import { resource, service, volume } from "@vyft/primitives";
import { crypto } from "@vyft/std";

export interface PostgresOptions {
  /** PostgreSQL version (default: "16") */
  version?: string;
  /** Volume size (default: "10Gi") */
  size?: string;
}

export interface PostgresResult {
  /** Connection URL */
  url: Interpolation;
  /** Service host */
  host: string;
  /** Service port */
  port: number;
}

/**
 * Create a PostgreSQL database using a container.
 *
 * @example
 * ```ts
 * const db = postgres("main");
 * const api = service("api", {
 *   env: { DATABASE_URL: db.url },
 *   dependsOn: [db],
 * });
 * ```
 */
export const postgres = resource("postgres", (id, opts?: PostgresOptions) => {
  const version = opts?.version ?? "16";
  const size = opts?.size ?? "10Gi";

  const password = crypto.randomString({ length: 32 });
  const data = volume("data", { size });

  const svc = service(id, {
    image: `postgres:${version}-alpine`,
    port: 5432,
    env: {
      POSTGRES_DB: "postgres",
      POSTGRES_USER: "postgres",
      POSTGRES_PASSWORD: password.result,
    },
    mounts: [{ source: data, path: "/var/lib/postgresql/data" }],
  });

  return {
    outputs: {
      url: interpolate`postgres://postgres:${password.result}@${svc.host}:5432/postgres`,
      host: svc.host,
      port: 5432,
    },
    ready: svc,
  };
});
