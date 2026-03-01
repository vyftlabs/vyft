import type { Binding, Linkable, Service, Volume } from "@vyft/core";
import { bindable, service, volume } from "@vyft/core";

export interface RedisOptions {
  image?: string;
}

export interface Redis extends Linkable {
  readonly service: Service;
  readonly volume: Volume;
  readonly url: Binding;
  readonly host: Binding;
  readonly port: Binding;
}

export function redis(id: string, opts?: RedisOptions): Redis {
  const image = opts?.image ?? "redis:7-alpine";

  const vol = volume(`${id}-data`);

  const svc = service(id, {
    image,
    port: 6379,
    command: "redis-server --appendonly yes",
    mounts: [{ source: vol, path: "/data" }],
    health: {
      command: "redis-cli ping | grep PONG",
      interval: "5s",
      retries: 5,
    },
  });

  return {
    id,
    service: svc,
    volume: vol,
    url: bindable(`redis://${id}:6379`),
    host: bindable(id),
    port: bindable(6379),
  };
}
