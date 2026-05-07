import {
  Command,
  Compute,
  HealthCheck,
  KubeName,
  PathType,
  Port,
  Replicas,
  RouteCreate,
  VolumeCreate,
} from "@vyft/spec";
import { z } from "zod";

export const VariableFormEntry = z.object({
  key: z.string().min(1, "Key is required"),
  value: z.string(),
  secret: z.boolean(),
  sourceVariableId: z.uuid().optional(),
});
export type VariableFormEntry = z.infer<typeof VariableFormEntry>;

// Override fields whose spec defaults would otherwise make z.input ≠ z.output.
const RouteFormEntry = RouteCreate.extend({
  pathType: PathType,
  tls: z.boolean(),
});

export const ServiceFormSchema = z.object({
  name: KubeName,
  image: z.string().min(1, "Image is required"),
  port: Port,
  command: Command,
  replicas: Replicas,
  compute: Compute,
  healthCheck: HealthCheck,
  variables: z.array(VariableFormEntry),
  volumes: z.array(VolumeCreate),
  routes: z.array(RouteFormEntry),
});

export type ServiceFormValues = z.infer<typeof ServiceFormSchema>;
