import { z } from "zod";
import {
  BaseFields,
  Command,
  Instances,
  Port,
  ResourceName,
} from "./common.ts";
import { NestedRouteCreate, Route } from "./route.ts";
import { ResourceVariable, ResourceVariableCreate } from "./variable.ts";

export const ImageSource = z
  .object({
    type: z.literal("image"),
    image: z.string().min(1),
  })
  .meta({ id: "ImageSource" });

export const Resources = z
  .object({
    cpu: z.number().positive(),
    memory: z.number().int().positive(),
  })
  .meta({
    id: "Resources",
    description: "`cpu` is fractional cores. `memory` is megabytes.",
  });

export const HealthCheck = z
  .discriminatedUnion("type", [
    z.object({ type: z.literal("none") }),
    z.object({
      type: z.literal("http"),
      path: z.string().min(1),
      port: Port.optional(),
    }),
    z.object({ type: z.literal("tcp"), port: Port }),
    z.object({ type: z.literal("command"), command: z.string() }),
  ])
  .meta({ id: "HealthCheck" });

export const healthCheckDefaults = {
  none: { type: "none" },
  http: { type: "http", path: "/health" },
  tcp: { type: "tcp", port: 8080 },
  command: { type: "command", command: "" },
} as const satisfies Record<HealthCheck["type"], HealthCheck>;

export const Disk = z
  .object({
    id: z.uuid(),
    name: ResourceName,
    size: z.number().int().positive(),
    path: z.string().min(1).max(500).regex(/^\//),
  })
  .meta({
    id: "Disk",
    description: "Persistent disk attached to a resource. `size` is megabytes.",
  });

export const DiskCreate = Disk.omit({ id: true }).meta({ id: "DiskCreate" });

export const AppSpec = z
  .object({
    source: ImageSource,
    port: Port.nullable(),
    startCommand: Command.nullable(),
    instances: Instances,
    resources: Resources,
    healthCheck: HealthCheck,
    disks: z.array(Disk).optional(),
    routes: z.array(Route).optional(),
  })
  .meta({ id: "AppSpec" });

export const AppSpecCreate = z
  .object({
    source: ImageSource,
    port: Port.optional(),
    startCommand: Command.optional(),
    instances: Instances,
    resources: Resources,
    healthCheck: HealthCheck,
    disks: z.array(DiskCreate).optional(),
    routes: z.array(NestedRouteCreate).optional(),
  })
  .meta({ id: "AppSpecCreate" });

export const AppSpecUpdate = AppSpecCreate.partial().meta({
  id: "AppSpecUpdate",
});

// =============================================================================
// Postgres — managed database, backed by the CloudNativePG operator. We render
// a single `Cluster` CR; the operator owns the StatefulSet/PVCs/failover and
// generates the connection Secret. version is the major; instances=1 is a
// single node, >1 is primary + replicas (HA). storage is the PVC size (MB).
// =============================================================================

export const PostgresVersion = z
  .enum(["14", "15", "16", "17"])
  .meta({ id: "PostgresVersion" });

// Barman compression for WAL + base backups. Maps to CNPG
// backup.barmanObjectStore.{wal,data}.compression ("none" omits it).
export const BackupCompression = z
  .enum(["none", "gzip", "snappy", "bzip2", "lz4", "xz", "zstd"])
  .meta({ id: "BackupCompression" });

// Scheduled backups to a user-provided S3-compatible object store, via CNPG's
// barmanObjectStore + a ScheduledBackup CR. Credentials are rendered into a
// per-resource k8s Secret; s3Credentials reference it.
export const PostgresBackup = z
  .object({
    // s3://bucket/prefix — must be unique per cluster.
    destinationPath: z.string().min(1),
    // Optional for S3-compatible stores (R2, MinIO, ...); omit for AWS S3.
    endpointURL: z.string().optional(),
    region: z.string().optional(),
    accessKeyId: z.string().min(1),
    secretAccessKey: z.string().min(1),
    // 6-field cron (CNPG includes a seconds field), e.g. "0 0 2 * * *".
    schedule: z.string().min(1),
    // Recovery-window retention → CNPG retentionPolicy "<n>d".
    retentionDays: z.number().int().positive(),
    compression: BackupCompression.optional(),
  })
  .meta({ id: "PostgresBackup" });

// A CNPG Backup record (scheduled or on-demand), as surfaced in the Backups
// tab. Mirrors the Backup CR's status.
export const Backup = z
  .object({
    name: z.string(),
    phase: z.string(), // running | completed | failed | ...
    backupId: z.string().optional(),
    method: z.string().optional(),
    startedAt: z.iso.datetime().optional(),
    stoppedAt: z.iso.datetime().optional(),
    error: z.string().optional(),
  })
  .meta({ id: "Backup" });

export const PostgresSpec = z
  .object({
    version: PostgresVersion,
    instances: Instances,
    storage: z.number().int().positive(),
    resources: Resources,
    // initial database created at bootstrap; its owner role shares the name.
    database: z.string().min(1).max(63),
    backup: PostgresBackup.optional(),
  })
  .meta({ id: "PostgresSpec" });

export const PostgresSpecCreate = PostgresSpec.meta({ id: "PostgresSpecCreate" });

// version downgrade + database rename are rejected server-side (immutable
// post-bootstrap); the partial shape only gates which fields the form sends.
export const PostgresSpecUpdate = PostgresSpecCreate.partial().meta({
  id: "PostgresSpecUpdate",
});

// =============================================================================
// Redis — managed cache/key-value store. Rendered as a labelled Deployment +
// Service + Secret (generated password) + optional PVC for persistence, plus a
// redis_exporter sidecar for metrics. No operator — a single instance is all a
// cache needs; status/metrics flow through the standard Deployment+pod path.
// version is the major; storage>0 enables an AOF-persisted PVC.
// =============================================================================

export const RedisVersion = z
  .enum(["6", "7"])
  .meta({ id: "RedisVersion" });

export const RedisSpec = z
  .object({
    version: RedisVersion,
    storage: z.number().int().min(0),
    resources: Resources,
  })
  .meta({ id: "RedisSpec" });

export const RedisSpecCreate = RedisSpec.meta({ id: "RedisSpecCreate" });

// version downgrade is rejected server-side; partial only gates form sends.
export const RedisSpecUpdate = RedisSpecCreate.partial().meta({
  id: "RedisSpecUpdate",
});

// =============================================================================
// Resource config — single discriminated union over all resource kinds.
//
// Each variant: { kind: <literal>, spec: <kind-specific shape> }
// Future kinds (worker, template) add as additional union members.
// =============================================================================

export const ResourceConfig = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("app"), spec: AppSpec }),
    z.object({ kind: z.literal("postgres"), spec: PostgresSpec }),
    z.object({ kind: z.literal("redis"), spec: RedisSpec }),
  ])
  .meta({ id: "ResourceConfig" });

export const ResourceConfigCreate = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("app"), spec: AppSpecCreate }),
    z.object({ kind: z.literal("postgres"), spec: PostgresSpecCreate }),
    z.object({ kind: z.literal("redis"), spec: RedisSpecCreate }),
  ])
  .meta({ id: "ResourceConfigCreate" });

export const ResourceConfigUpdate = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("app"), spec: AppSpecUpdate.optional() }),
    z.object({ kind: z.literal("postgres"), spec: PostgresSpecUpdate.optional() }),
    z.object({ kind: z.literal("redis"), spec: RedisSpecUpdate.optional() }),
  ])
  .meta({ id: "ResourceConfigUpdate" });

// Runtime health state, derived from the live k8s Deployment + Pods at
// read time (see backend internal/status). Best-effort: omitted/`unknown`
// when the cluster is unreachable. Drives the service-graph node coloring.
export const ServiceState = z
  .enum([
    "running", // all replicas ready
    "pending", // deploying, scaling, scheduling, pulling image
    "degraded", // partial — some replicas ready, some not
    "failed", // CrashLoopBackOff, OOMKilled, ImagePullBackOff, etc.
    "stopped", // scaled to 0 intentionally
    "terminating", // being deleted
    "unknown", // no deployment yet, or cluster unreachable
  ])
  .meta({ id: "ServiceState" });

export const ServiceStatus = z
  .object({
    state: ServiceState,
    message: z.string().optional(),
  })
  .meta({ id: "ServiceStatus" });

const ResourceBase = BaseFields.extend({
  name: ResourceName,
  // Slug is the immutable k8s identifier — derived from name + uuid suffix
  // at create. Used everywhere a stable handle is needed (object names,
  // labels, observability selectors). Name remains editable + display-only.
  slug: z.string().min(1).max(63),
  projectId: z.uuid(),
  positionX: z.number(),
  positionY: z.number(),
  variables: z.array(ResourceVariable).optional(),
});

export const Resource = ResourceBase.extend({
  config: ResourceConfig,
  // Populated only on list/get reads, best-effort. Absent on create/update.
  status: ServiceStatus.optional(),
}).meta({ id: "Resource" });

export const ResourceCreate = z
  .object({
    name: ResourceName,
    positionX: z.number(),
    positionY: z.number(),
    variables: z.array(ResourceVariableCreate).optional(),
    config: ResourceConfigCreate,
  })
  .meta({ id: "ResourceCreate" });

// Narrowed per-kind variants. Used by the form layer (RHF) so each form binds
// to a concrete spec instead of the discriminated union.
export const ResourceAppCreate = z
  .object({
    name: ResourceName,
    positionX: z.number(),
    positionY: z.number(),
    variables: z.array(ResourceVariableCreate).optional(),
    config: z.object({
      kind: z.literal("app"),
      spec: AppSpecCreate,
    }),
  })
  .meta({ id: "ResourceAppCreate" });

export const ResourcePostgresCreate = z
  .object({
    name: ResourceName,
    positionX: z.number(),
    positionY: z.number(),
    config: z.object({
      kind: z.literal("postgres"),
      spec: PostgresSpecCreate,
    }),
  })
  .meta({ id: "ResourcePostgresCreate" });

export const ResourceRedisCreate = z
  .object({
    name: ResourceName,
    positionX: z.number(),
    positionY: z.number(),
    config: z.object({
      kind: z.literal("redis"),
      spec: RedisSpecCreate,
    }),
  })
  .meta({ id: "ResourceRedisCreate" });

export const ResourceUpdate = z
  .object({
    name: ResourceName.optional(),
    positionX: z.number().optional(),
    positionY: z.number().optional(),
    config: ResourceConfigUpdate.optional(),
  })
  .meta({ id: "ResourceUpdate" });

export type ServiceState = z.infer<typeof ServiceState>;
export type ServiceStatus = z.infer<typeof ServiceStatus>;
export type ImageSource = z.infer<typeof ImageSource>;
export type Resources = z.infer<typeof Resources>;
export type HealthCheck = z.infer<typeof HealthCheck>;
export type Disk = z.infer<typeof Disk>;
export type DiskCreate = z.infer<typeof DiskCreate>;
export type AppSpec = z.infer<typeof AppSpec>;
export type AppSpecCreate = z.infer<typeof AppSpecCreate>;
export type AppSpecUpdate = z.infer<typeof AppSpecUpdate>;
export type PostgresVersion = z.infer<typeof PostgresVersion>;
export type Backup = z.infer<typeof Backup>;
export type BackupCompression = z.infer<typeof BackupCompression>;
export type PostgresBackup = z.infer<typeof PostgresBackup>;
export type PostgresSpec = z.infer<typeof PostgresSpec>;
export type PostgresSpecCreate = z.infer<typeof PostgresSpecCreate>;
export type PostgresSpecUpdate = z.infer<typeof PostgresSpecUpdate>;
export type RedisVersion = z.infer<typeof RedisVersion>;
export type RedisSpec = z.infer<typeof RedisSpec>;
export type RedisSpecCreate = z.infer<typeof RedisSpecCreate>;
export type RedisSpecUpdate = z.infer<typeof RedisSpecUpdate>;
export type ResourceConfig = z.infer<typeof ResourceConfig>;
export type ResourceConfigCreate = z.infer<typeof ResourceConfigCreate>;
export type ResourceConfigUpdate = z.infer<typeof ResourceConfigUpdate>;
export type Resource = z.infer<typeof Resource>;
export type ResourceCreate = z.infer<typeof ResourceCreate>;
export type ResourceAppCreate = z.infer<typeof ResourceAppCreate>;
export type ResourcePostgresCreate = z.infer<typeof ResourcePostgresCreate>;
export type ResourceRedisCreate = z.infer<typeof ResourceRedisCreate>;
export type ResourceUpdate = z.infer<typeof ResourceUpdate>;
