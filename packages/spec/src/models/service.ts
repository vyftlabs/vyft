import { z } from "zod";
import { BaseFields } from "./common.ts";

export const Source = z
  .object({
    type: z.literal("image"),
    image: z.string().min(1),
  })
  .meta({ id: "Source" });

export const Compute = z
  .object({
    cpuRequest: z.number().int().positive(),
    cpuLimit: z.number().int().positive(),
    memoryRequest: z.number().int().positive(),
    memoryLimit: z.number().int().positive(),
  })
  .meta({
    id: "Compute",
    description: "CPU values are millicores. Memory values are bytes.",
  });

export const Port = z.number().int().min(1).max(65535);
export const Replicas = z.number().int().min(0).max(100);
export const Command = z.string().max(2000);

export const HealthCheck = z
  .discriminatedUnion("type", [
    z.object({ type: z.literal("none") }),
    z.object({
      type: z.literal("http"),
      path: z.string().min(1),
      port: Port.optional(),
    }),
    z.object({ type: z.literal("tcp"), port: Port }),
    z.object({ type: z.literal("exec"), command: z.string().min(1) }),
  ])
  .meta({ id: "HealthCheck" });

export const App = BaseFields.extend({
  serviceId: z.uuid(),
  source: Source,
  port: Port.nullable(),
  command: Command.nullable(),
  replicas: Replicas,
  compute: Compute,
  healthCheck: HealthCheck,
}).meta({ id: "App" });

export const ServiceType = z.enum(["app"]).meta({ id: "ServiceType" });

export const Service = BaseFields.extend({
  resourceId: z.uuid(),
  type: ServiceType,
  app: App.nullable(),
}).meta({ id: "Service" });

export type Source = z.infer<typeof Source>;
export type Compute = z.infer<typeof Compute>;
export type HealthCheck = z.infer<typeof HealthCheck>;
export type App = z.infer<typeof App>;
export type ServiceType = z.infer<typeof ServiceType>;
export type Service = z.infer<typeof Service>;
