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
// Resource config — single discriminated union over all resource kinds.
//
// Each variant: { kind: <literal>, spec: <kind-specific shape> }
// Future kinds (worker, postgres, template) add as additional union members.
// =============================================================================

export const ResourceConfig = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("app"), spec: AppSpec }),
  ])
  .meta({ id: "ResourceConfig" });

export const ResourceConfigCreate = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("app"), spec: AppSpecCreate }),
  ])
  .meta({ id: "ResourceConfigCreate" });

export const ResourceConfigUpdate = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("app"), spec: AppSpecUpdate.optional() }),
  ])
  .meta({ id: "ResourceConfigUpdate" });

const ResourceBase = BaseFields.extend({
  name: ResourceName,
  projectId: z.uuid(),
  positionX: z.number(),
  positionY: z.number(),
  variables: z.array(ResourceVariable).optional(),
});

export const Resource = ResourceBase.extend({
  config: ResourceConfig,
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

// Narrowed app-only variant. Used by form layer (RHF).
// Adding worker/postgres/template = export sibling type.
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

export const ResourceUpdate = z
  .object({
    name: ResourceName.optional(),
    positionX: z.number().optional(),
    positionY: z.number().optional(),
    config: ResourceConfigUpdate.optional(),
  })
  .meta({ id: "ResourceUpdate" });

export type ImageSource = z.infer<typeof ImageSource>;
export type Resources = z.infer<typeof Resources>;
export type HealthCheck = z.infer<typeof HealthCheck>;
export type Disk = z.infer<typeof Disk>;
export type DiskCreate = z.infer<typeof DiskCreate>;
export type AppSpec = z.infer<typeof AppSpec>;
export type AppSpecCreate = z.infer<typeof AppSpecCreate>;
export type AppSpecUpdate = z.infer<typeof AppSpecUpdate>;
export type ResourceConfig = z.infer<typeof ResourceConfig>;
export type ResourceConfigCreate = z.infer<typeof ResourceConfigCreate>;
export type ResourceConfigUpdate = z.infer<typeof ResourceConfigUpdate>;
export type Resource = z.infer<typeof Resource>;
export type ResourceCreate = z.infer<typeof ResourceCreate>;
export type ResourceAppCreate = z.infer<typeof ResourceAppCreate>;
export type ResourceUpdate = z.infer<typeof ResourceUpdate>;
