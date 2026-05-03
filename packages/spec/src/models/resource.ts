import { z } from "zod"
import { Uuid } from "./common.ts"
import { Service, Source, Compute, HealthCheck } from "./service.ts"
import { Route, RouteCreate } from "./route.ts"
import { Volume, VolumeCreate } from "./volume.ts"
import { Variable } from "./variable.ts"

export const ResourceType = z.enum(["service"]).meta({ id: "ResourceType" })

export const Resource = z.object({
  id: Uuid,
  name: z.string(),
  type: ResourceType,
  projectId: Uuid,
  positionX: z.number(),
  positionY: z.number(),
  service: Service.extend({
    routes: z.array(Route).optional(),
    volumeMounts: z.array(z.object({
      id: Uuid,
      mountPath: z.string(),
      volume: Volume,
    })).optional(),
  }).nullable(),
  variables: z.array(Variable).optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).meta({ id: "Resource" })

export const ResourceCreate = z.object({
  type: ResourceType,
  name: z.string().min(1).max(100).regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/),
  positionX: z.number().default(0),
  positionY: z.number().default(0),
  source: Source,
  port: z.number().int().min(1).max(65535).optional(),
  command: z.string().max(2000).optional(),
  replicas: z.number().int().min(0).max(100).default(1),
  compute: Compute.optional(),
  healthCheck: HealthCheck.optional(),
  variables: z.array(Variable.pick({
    key: true,
    value: true,
    sensitive: true,
    sourceVariableId: true,
  })).optional(),
  volumes: z.array(VolumeCreate).optional(),
  routes: z.array(RouteCreate).optional(),
}).meta({ id: "ResourceCreate" })

export const ResourceUpdate = z.object({
  name: z.string().min(1).max(100).regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/).optional(),
  source: Source.optional(),
  port: z.number().int().min(1).max(65535).nullable().optional(),
  command: z.string().max(2000).nullable().optional(),
  replicas: z.number().int().min(0).max(100).optional(),
  compute: Compute.optional(),
  healthCheck: HealthCheck.optional(),
}).meta({ id: "ResourceUpdate" })

export const ResourcePosition = z.object({
  positionX: z.number(),
  positionY: z.number(),
}).meta({ id: "ResourcePosition" })

export type ResourceType = z.infer<typeof ResourceType>
export type Resource = z.infer<typeof Resource>
export type ResourceCreate = z.infer<typeof ResourceCreate>
export type ResourceUpdate = z.infer<typeof ResourceUpdate>
export type ResourcePosition = z.infer<typeof ResourcePosition>
