import type {
  Resource,
  ResourcePostgresCreate,
  ResourceUpdate,
} from "@vyft/spec";
import { getPostgresSpec } from "@/lib/resource";

// fromPostgresResource builds RHF defaults for the postgres form — from an
// existing resource, or blank defaults when creating.
export function fromPostgresResource(
  resource?: Resource,
): ResourcePostgresCreate {
  const spec = resource ? getPostgresSpec(resource) : null;
  return {
    name: resource?.name ?? "",
    positionX: resource?.positionX ?? 0,
    positionY: resource?.positionY ?? 0,
    config: {
      kind: "postgres",
      spec: {
        // Default to the latest major with real production maturity (17, 2024)
        // rather than the newest-possible or an older release.
        version: spec?.version ?? "17",
        instances: spec?.instances ?? 1,
        // Small/hobby defaults: single node, 0.5 core / 512 MiB / 1 GiB. This
        // is the safe floor — Postgres + the CNPG instance-manager sidecar get
        // OOM-prone below ~256 MiB and sluggish under ~0.5 core. Users scale up.
        storage: spec?.storage ?? 1024,
        resources: spec?.resources ?? { cpu: 0.5, memory: 512 },
        database: spec?.database ?? "postgres",
        // undefined = backups disabled; the form toggle seeds defaults on enable.
        backup: spec?.backup,
      },
    },
  };
}

// Defaults seeded when the backup toggle is switched on.
export const defaultBackup = {
  destinationPath: "",
  endpointURL: "",
  region: "",
  accessKeyId: "",
  secretAccessKey: "",
  schedule: "0 0 2 * * *", // daily 02:00 (6-field cron, seconds first)
  retentionDays: 30,
  compression: "gzip" as const,
};

// toPostgresUpdate maps form state to a PATCH body. version + database are
// immutable post-bootstrap (rejected server-side) but sent for completeness;
// the backend ignores no-op/blocked changes.
export function toPostgresUpdate(values: ResourcePostgresCreate): ResourceUpdate {
  return {
    name: values.name.trim(),
    config: {
      kind: "postgres",
      spec: values.config.spec,
    },
  };
}
