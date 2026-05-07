import type { Resource, ResourceCreate, ResourceUpdate } from "@vyft/spec";
import type { ServiceFormValues } from "./schema";

const DEFAULT_COMPUTE = {
  cpuRequest: 100,
  cpuLimit: 500,
  memoryRequest: 128 * 1024 * 1024,
  memoryLimit: 512 * 1024 * 1024,
};

export function fromResource(resource?: Resource): ServiceFormValues {
  const app = resource?.service?.app;
  return {
    name: resource?.name ?? "",
    image: app?.source?.image ?? "",
    port: app?.port ?? 8080,
    command: app?.command ?? "",
    replicas: app?.replicas ?? 1,
    compute: app?.compute ?? DEFAULT_COMPUTE,
    healthCheck: app?.healthCheck ?? { type: "none" },
    variables: [],
    volumes: [],
    routes: [],
  };
}

export interface ResourceCreatePosition {
  x: number;
  y: number;
}

export function toResourceCreate(
  values: ServiceFormValues,
  position?: ResourceCreatePosition,
): ResourceCreate {
  return {
    type: "service",
    name: values.name.trim(),
    positionX: position?.x ?? 0,
    positionY: position?.y ?? 0,
    source: { type: "image", image: values.image.trim() },
    port: values.port,
    command: values.command.trim() || undefined,
    replicas: values.replicas,
    compute: values.compute,
    healthCheck: values.healthCheck,
    variables: values.variables
      .filter((v) => v.key.trim())
      .map((v) => ({
        key: v.key.trim(),
        value: v.value || undefined,
        sensitive: v.secret,
        sourceVariableId: v.sourceVariableId,
      })),
    volumes: values.volumes,
    routes: values.routes,
  };
}

export function toResourceUpdate(values: ServiceFormValues): ResourceUpdate {
  return {
    name: values.name.trim(),
    source: { type: "image", image: values.image.trim() },
    port: values.port,
    command: values.command.trim() || null,
    replicas: values.replicas,
    compute: values.compute,
    healthCheck: values.healthCheck,
  };
}
