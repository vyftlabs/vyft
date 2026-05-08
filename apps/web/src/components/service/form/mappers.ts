import {
  DiskCreate,
  type Resource,
  type ResourceUpdate,
  RouteCreate,
  type ServiceAppCreate,
} from "@vyft/spec";
import { getAppSpec } from "@/lib/resource";

export function fromResource(resource?: Resource): ServiceAppCreate {
  const spec = resource ? getAppSpec(resource) : null;
  return {
    name: resource?.name ?? "",
    positionX: resource?.positionX ?? 0,
    positionY: resource?.positionY ?? 0,
    category: "service",
    service: {
      kind: "app",
      spec: {
        source: spec?.source ?? { type: "image", image: "" },
        port: spec?.port ?? undefined,
        startCommand: spec?.startCommand ?? undefined,
        instances: spec?.instances ?? 1,
        resources: spec?.resources ?? { cpu: 0.5, memory: 512 },
        healthCheck: spec?.healthCheck ?? { type: "none" },
        disks: spec?.disks?.map((d) => DiskCreate.parse(d)) ?? [],
        routes: spec?.routes?.map((r) => RouteCreate.parse(r)) ?? [],
      },
    },
    variables: [],
  };
}

export function toResourceUpdate(values: ServiceAppCreate): ResourceUpdate {
  return {
    name: values.name.trim(),
    category: "service",
    service: {
      kind: "app",
      spec: {
        source: values.service.spec.source,
        port: values.service.spec.port,
        startCommand: values.service.spec.startCommand,
        instances: values.service.spec.instances,
        resources: values.service.spec.resources,
        healthCheck: values.service.spec.healthCheck,
      },
    },
  };
}
