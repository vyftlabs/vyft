import {
  Command,
  DiskCreate,
  Instances,
  PathType,
  Port,
  ResourceName,
  Resources,
  RouteCreate,
} from "@vyft/spec";
import { z } from "zod";

export const VariableFormEntry = z.object({
  key: z.string().min(1, "Key is required"),
  value: z.string(),
  secret: z.boolean(),
  sourceVariableId: z.uuid().optional(),
});
export type VariableFormEntry = z.infer<typeof VariableFormEntry>;

const RouteFormEntry = RouteCreate.extend({
  pathType: PathType,
  tls: z.boolean(),
});

// Form-bound HealthCheck: same shape as spec but no defaults so z.input ≡ z.output (RHF requirement).
const HealthCheckFormEntry = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  z.object({
    type: z.literal("http"),
    path: z.string().min(1),
    port: Port.optional(),
  }),
  z.object({ type: z.literal("tcp"), port: Port }),
  z.object({ type: z.literal("command"), command: z.string() }),
]);

export const ServiceFormSchema = z.object({
  name: ResourceName,
  image: z.string().min(1, "Image is required"),
  port: Port,
  startCommand: Command,
  instances: Instances,
  resources: Resources,
  healthCheck: HealthCheckFormEntry,
  variables: z.array(VariableFormEntry),
  disks: z.array(DiskCreate),
  routes: z.array(RouteFormEntry),
});

export type ServiceFormValues = z.infer<typeof ServiceFormSchema>;
