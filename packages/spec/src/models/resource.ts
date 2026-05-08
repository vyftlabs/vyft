import { z } from "zod";
import {
  BaseFields,
  Command,
  Instances,
  Port,
  ResourceName,
} from "./common.ts";
import { Route, RouteCreate } from "./route.ts";
import { Variable, VariableCreate } from "./variable.ts";

export const Source = z
  .object({
    type: z.literal("image"),
    image: z.string().min(1),
  })
  .meta({ id: "Source" });

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
      path: z.string().min(1).default("/health"),
      port: Port.optional(),
    }),
    z.object({ type: z.literal("tcp"), port: Port.default(8080) }),
    z.object({ type: z.literal("command"), command: z.string().default("") }),
  ])
  .meta({ id: "HealthCheck" });

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
    source: Source,
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
    source: Source,
    port: Port.optional(),
    startCommand: Command.optional(),
    instances: Instances.default(1),
    resources: Resources,
    healthCheck: HealthCheck.default({ type: "none" }),
    disks: z.array(DiskCreate).optional(),
    routes: z.array(RouteCreate).optional(),
  })
  .meta({ id: "AppSpecCreate" });

export const AppSpecUpdate = AppSpecCreate.partial().meta({
  id: "AppSpecUpdate",
});

export const ServiceVariant = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("app"), spec: AppSpec }),
  ])
  .meta({ id: "ServiceVariant" });

export const ServiceVariantCreate = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("app"), spec: AppSpecCreate }),
  ])
  .meta({ id: "ServiceVariantCreate" });

export const ServiceVariantUpdate = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("app"), spec: AppSpecUpdate.optional() }),
  ])
  .meta({ id: "ServiceVariantUpdate" });

const ResourceBase = BaseFields.extend({
  name: ResourceName,
  projectId: z.uuid(),
  positionX: z.number(),
  positionY: z.number(),
  variables: z.array(Variable).optional(),
});

export const Resource = ResourceBase.and(
  z.discriminatedUnion("category", [
    z.object({ category: z.literal("service"), service: ServiceVariant }),
  ]),
).meta({ id: "Resource" });

const ResourceCreateBase = z.object({
  name: ResourceName,
  positionX: z.number().default(0),
  positionY: z.number().default(0),
  variables: z.array(VariableCreate.omit({ resourceId: true })).optional(),
});

export const ResourceCreate = ResourceCreateBase.and(
  z.discriminatedUnion("category", [
    z.object({
      category: z.literal("service"),
      service: ServiceVariantCreate,
    }),
  ]),
).meta({ id: "ResourceCreate" });

const ResourceUpdateBase = z.object({
  name: ResourceName.optional(),
});

export const ResourceUpdate = ResourceUpdateBase.and(
  z
    .discriminatedUnion("category", [
      z.object({
        category: z.literal("service"),
        service: ServiceVariantUpdate.optional(),
      }),
    ])
    .optional(),
).meta({ id: "ResourceUpdate" });

export const ResourcePosition = z
  .object({
    positionX: z.number(),
    positionY: z.number(),
  })
  .meta({ id: "ResourcePosition" });

export type Source = z.infer<typeof Source>;
export type Resources = z.infer<typeof Resources>;
export type HealthCheck = z.infer<typeof HealthCheck>;
export type Disk = z.infer<typeof Disk>;
export type DiskCreate = z.infer<typeof DiskCreate>;
export type AppSpec = z.infer<typeof AppSpec>;
export type AppSpecCreate = z.infer<typeof AppSpecCreate>;
export type AppSpecUpdate = z.infer<typeof AppSpecUpdate>;
export type ServiceVariant = z.infer<typeof ServiceVariant>;
export type ServiceVariantCreate = z.infer<typeof ServiceVariantCreate>;
export type ServiceVariantUpdate = z.infer<typeof ServiceVariantUpdate>;
export type Resource = z.infer<typeof Resource>;
export type ResourceCreate = z.infer<typeof ResourceCreate>;
export type ResourceUpdate = z.infer<typeof ResourceUpdate>;
export type ResourcePosition = z.infer<typeof ResourcePosition>;
