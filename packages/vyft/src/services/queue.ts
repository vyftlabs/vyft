import type { Binding, Config, Linkable, Service, Volume } from "@vyft/core";
import { bindable, config, interpolate, service, volume } from "@vyft/core";

export interface QueueOptions {
  image?: string;
  username?: string;
}

export interface Queue extends Linkable {
  readonly service: Service;
  readonly volume: Volume;
  readonly password: Config;
  readonly url: Binding;
  readonly host: Binding;
  readonly port: Binding;
}

export function queue(id: string, opts?: QueueOptions): Queue {
  const image = opts?.image ?? "rabbitmq:4-management";
  const username = opts?.username ?? "guest";

  const vol = volume(`${id}-data`);
  const pw = config(`${id}-password`, { secret: true });

  const svc = service(id, {
    image,
    port: 5672,
    env: {
      RABBITMQ_DEFAULT_USER: username,
      RABBITMQ_DEFAULT_PASS: pw,
    },
    mounts: [{ source: vol, path: "/var/lib/rabbitmq" }],
    health: {
      command: "rabbitmq-diagnostics -q ping",
      interval: "5s",
      retries: 5,
    },
  });

  return {
    id,
    service: svc,
    volume: vol,
    password: pw,
    url: bindable(interpolate`amqp://${username}:${pw}@${id}:5672`),
    host: bindable(id),
    port: bindable(5672),
  };
}
