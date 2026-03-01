import type { Binding, Config, Linkable, Service, Volume } from "@vyft/core";
import { bindable, config, interpolate, service, volume } from "@vyft/core";

export interface PostgresOptions {
  image?: string;
  database?: string;
  username?: string;
}

export interface Postgres extends Linkable {
  readonly service: Service;
  readonly volume: Volume;
  readonly password: Config;
  readonly url: Binding;
  readonly host: Binding;
  readonly port: Binding;
}

export function postgres(id: string, opts?: PostgresOptions): Postgres {
  const image = opts?.image ?? "postgres:17";
  const database = opts?.database ?? "postgres";
  const username = opts?.username ?? "postgres";

  const vol = volume(`${id}-data`);
  const pw = config(`${id}-password`, { secret: true });

  const svc = service(id, {
    image,
    port: 5432,
    env: {
      POSTGRES_DB: database,
      POSTGRES_USER: username,
      POSTGRES_PASSWORD: pw,
    },
    mounts: [{ source: vol, path: "/var/lib/postgresql/data" }],
    health: {
      command: `pg_isready -U ${username}`,
      interval: "5s",
      retries: 5,
    },
  });

  return {
    id,
    service: svc,
    volume: vol,
    password: pw,
    url: bindable(
      interpolate`postgres://${username}:${pw}@${id}:5432/${database}`,
    ),
    host: bindable(id),
    port: bindable(5432),
  };
}
