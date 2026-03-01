import type { Binding, Config, Linkable, Service, Volume } from "@vyft/core";
import { bindable, config, service, volume } from "@vyft/core";

export interface Bucket extends Linkable {
  readonly service: Service;
  readonly url: Binding;
  readonly name: Binding;
  readonly host: Binding;
  readonly port: Binding;
  readonly access: Binding;
  readonly secret: Binding;
}

// Module-level singleton for shared Garage
let shared: {
  svc: Service;
  vol: Volume;
  accessKey: Config;
  secretKey: Config;
} | null = null;

function getSharedStorage() {
  if (!shared) {
    const vol = volume("storage-data");
    const accessKey = config("storage-access-key", { secret: true });
    const secretKey = config("storage-secret-key", { secret: true });
    const svc = service("storage", {
      image: "dxflrs/garage:v1.1.0",
      port: 3900,
      env: {
        GARAGE_ACCESS_KEY: accessKey,
        GARAGE_SECRET_KEY: secretKey,
      },
      mounts: [{ source: vol, path: "/var/lib/garage" }],
      health: {
        command: "curl -f http://localhost:3900/health || exit 1",
        interval: "5s",
        retries: 5,
      },
    });
    shared = { svc, vol, accessKey, secretKey };
  }
  return shared;
}

export function bucket(name: string): Bucket {
  const { svc, accessKey, secretKey } = getSharedStorage();
  return {
    id: name,
    service: svc,
    url: bindable("http://storage:3900"),
    name: bindable(name),
    host: bindable("storage"),
    port: bindable(3900),
    access: bindable(accessKey),
    secret: bindable(secretKey),
  };
}
