import { z } from "zod"
import { Uuid } from "./common.ts"

export const Source = z.object({
  type: z.literal("image"),
  image: z.string().min(1),
}).meta({ id: "Source" })

export const Compute = z.object({
  cpuRequest: z.string().min(1),
  cpuLimit: z.string().min(1),
  memoryRequest: z.string().min(1),
  memoryLimit: z.string().min(1),
}).meta({ id: "Compute" })

export const HealthCheck = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  z.object({
    type: z.literal("http"),
    path: z.string().min(1),
    port: z.number().int().min(1).max(65535).optional(),
  }),
  z.object({
    type: z.literal("tcp"),
    port: z.number().int().min(1).max(65535),
  }),
  z.object({
    type: z.literal("exec"),
    command: z.string().min(1),
  }),
]).meta({ id: "HealthCheck" })

export const App = z.object({
  id: Uuid,
  serviceId: Uuid,
  source: Source,
  port: z.number().int().min(1).max(65535).nullable(),
  command: z.string().nullable(),
  replicas: z.number().int().min(0).max(100),
  compute: Compute,
  healthCheck: HealthCheck,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).meta({ id: "App" })

export const ServiceType = z.enum(["app"]).meta({ id: "ServiceType" })

export const Service = z.object({
  id: Uuid,
  resourceId: Uuid,
  type: ServiceType,
  app: App.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).meta({ id: "Service" })

export type Source = z.infer<typeof Source>
export type Compute = z.infer<typeof Compute>
export type HealthCheck = z.infer<typeof HealthCheck>
export type App = z.infer<typeof App>
export type Service = z.infer<typeof Service>
