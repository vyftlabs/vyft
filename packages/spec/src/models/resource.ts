import { z } from "zod";
import { BaseFields, KubeName } from "./common.ts";
import { Route, RouteCreate } from "./route.ts";
import {
  Command,
  Compute,
  HealthCheck,
  Port,
  Replicas,
  Service,
  Source,
} from "./service.ts";
import { Variable, VariableCreate } from "./variable.ts";
import { Volume, VolumeCreate } from "./volume.ts";

export const ResourceType = z.enum(["service"]).meta({ id: "ResourceType" });

export const VolumeMount = z
  .object({
    id: z.uuid(),
    mountPath: z.string(),
    volume: Volume,
  })
  .meta({ id: "VolumeMount" });

export const Resource = BaseFields.extend({
  name: KubeName,
  type: ResourceType,
  projectId: z.uuid(),
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
    type: ResourceType.default("service"),
    name: KubeName,
    positionX: z.number().default(0),
    positionY: z.number().default(0),
    source: Source,
    port: Port.optional(),
    command: Command.optional(),
    replicas: Replicas.default(1),
    compute: Compute.optional(),
    healthCheck: HealthCheck.optional(),
    variables: z.array(VariableCreate.omit({ resourceId: true })).optional(),
    volumes: z.array(VolumeCreate).optional(),
    routes: z.array(RouteCreate).optional(),
  })
  .meta({ id: "ResourceCreate" });

export const ResourceUpdate = ResourceCreate.pick({
  name: true,
  source: true,
  replicas: true,
  compute: true,
  healthCheck: true,
})
  .partial()
  .extend({
    port: Port.nullable().optional(),
    command: Command.nullable().optional(),
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
