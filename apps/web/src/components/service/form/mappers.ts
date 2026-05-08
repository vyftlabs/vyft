import type { Resource, ResourceCreate, ResourceUpdate } from "@vyft/spec";
import { getAppSpec } from "@/lib/resource";
import type { ServiceFormValues } from "./schema";

const DEFAULT_RESOURCES = { cpu: 0.5, memory: 512 };

export function fromResource(resource?: Resource): ServiceFormValues {
  const spec = resource ? getAppSpec(resource) : null;
  return {
    name: resource?.name ?? "",
    image: spec?.source.image ?? "",
    port: spec?.port ?? 8080,
    startCommand: spec?.startCommand ?? "",
    instances: spec?.instances ?? 1,
    resources: spec?.resources ?? DEFAULT_RESOURCES,
    healthCheck: spec?.healthCheck ?? { type: "none" },
    variables: [],
    disks: [],
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
    name: values.name.trim(),
    positionX: position?.x ?? 0,
    positionY: position?.y ?? 0,
    category: "service",
    service: {
      kind: "app",
      spec: {
        source: { type: "image", image: values.image.trim() },
        port: values.port,
        startCommand: values.startCommand.trim() || undefined,
        instances: values.instances,
        resources: values.resources,
        healthCheck: values.healthCheck,
        disks: values.disks,
        routes: values.routes,
      },
    },
    variables: values.variables
      .filter((v) => v.key.trim())
      .map((v) => ({
        key: v.key.trim(),
        value: v.value || undefined,
        sensitive: v.secret,
        sourceVariableId: v.sourceVariableId,
      })),
  };
}

export function toResourceUpdate(values: ServiceFormValues): ResourceUpdate {
  return {
    name: values.name.trim(),
    category: "service",
    service: {
      kind: "app",
      spec: {
        source: { type: "image", image: values.image.trim() },
        port: values.port,
        startCommand: values.startCommand.trim() || undefined,
        instances: values.instances,
        resources: values.resources,
        healthCheck: values.healthCheck,
      },
    },
  };
}
