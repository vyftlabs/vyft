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

// Module-level singleton for shared MinIO
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
      image: "minio/minio",
      port: 9000,
      command: "server /data --console-address :9001",
      env: {
        MINIO_ROOT_USER: accessKey,
        MINIO_ROOT_PASSWORD: secretKey,
      },
      mounts: [{ source: vol, path: "/data" }],
      health: {
        command: "curl -f http://localhost:9000/minio/health/live",
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
    url: bindable("http://storage:9000"),
    name: bindable(name),
    host: bindable("storage"),
    port: bindable(9000),
    access: bindable(accessKey),
    secret: bindable(secretKey),
  };
}
