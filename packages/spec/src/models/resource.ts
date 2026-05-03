import { z } from "zod";
import { BaseFields, Uuid } from "./common.ts";
import { Route, RouteCreate } from "./route.ts";
import { Compute, HealthCheck, Service, Source } from "./service.ts";
import { Variable, VariableCreate } from "./variable.ts";
import { Volume, VolumeCreate } from "./volume.ts";

export const ResourceType = z.enum(["service"]).meta({ id: "ResourceType" });

const ResourceName = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/);

export const VolumeMount = z
  .object({
    id: Uuid,
    mountPath: z.string(),
    volume: Volume,
  })
  .meta({ id: "VolumeMount" });

export const Resource = BaseFields.extend({
  name: z.string(),
  type: ResourceType,
  projectId: Uuid,
  positionX: z.number(),
  positionY: z.number(),
  service: Service.extend({
    routes: z.array(Route).optional(),
    volumeMounts: z.array(VolumeMount).optional(),
  }).nullable(),
  variables: z.array(Variable).optional(),
}).meta({ id: "Resource" });

export const ResourceCreate = z
  .object({
    type: ResourceType,
    name: ResourceName,
    positionX: z.number().default(0),
    positionY: z.number().default(0),
    source: Source,
    port: z.number().int().min(1).max(65535).optional(),
    command: z.string().max(2000).optional(),
    replicas: z.number().int().min(0).max(100).default(1),
    compute: Compute.optional(),
    healthCheck: HealthCheck.optional(),
    variables: z
      .array(
        VariableCreate.pick({
          key: true,
          value: true,
          sensitive: true,
          sourceVariableId: true,
        }),
      )
      .optional(),
    volumes: z.array(VolumeCreate).optional(),
    routes: z.array(RouteCreate).optional(),
  })
  .meta({ id: "ResourceCreate" });

export const ResourceUpdate = z
  .object({
    name: ResourceName.optional(),
    source: Source.optional(),
    port: z.number().int().min(1).max(65535).nullable().optional(),
    command: z.string().max(2000).nullable().optional(),
    replicas: z.number().int().min(0).max(100).optional(),
    compute: Compute.optional(),
    healthCheck: HealthCheck.optional(),
  })
  .meta({ id: "ResourceUpdate" });

export const ResourcePosition = Resource.pick({
  positionX: true,
  positionY: true,
}).meta({ id: "ResourcePosition" });

export type ResourceType = z.infer<typeof ResourceType>;
export type VolumeMount = z.infer<typeof VolumeMount>;
export type Resource = z.infer<typeof Resource>;
export type ResourceCreate = z.infer<typeof ResourceCreate>;
export type ResourceUpdate = z.infer<typeof ResourceUpdate>;
export type ResourcePosition = z.infer<typeof ResourcePosition>;
