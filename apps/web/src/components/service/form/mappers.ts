import {
  DiskCreate,
  NestedRouteCreate,
  type Resource,
  type ResourceAppCreate,
  type ResourceUpdate,
} from "@vyft/spec";
import { getAppSpec } from "@/lib/resource";

export function fromResource(resource?: Resource): ResourceAppCreate {
  const spec = resource ? getAppSpec(resource) : null;
  return {
    name: resource?.name ?? "",
    positionX: resource?.positionX ?? 0,
    positionY: resource?.positionY ?? 0,
    config: {
      kind: "app",
      spec: {
        source: spec?.source ?? { type: "image", image: "" },
        port: spec?.port ?? undefined,
        startCommand: spec?.startCommand ?? undefined,
        instances: spec?.instances ?? 1,
        resources: spec?.resources ?? { cpu: 0.5, memory: 512 },
        healthCheck: spec?.healthCheck ?? { type: "none" },
        disks: spec?.disks?.map((d) => DiskCreate.parse(d)) ?? [],
        routes: spec?.routes?.map((r) => NestedRouteCreate.parse(r)) ?? [],
      },
    },
    variables: [],
  };
}

export function toResourceUpdate(values: ResourceAppCreate): ResourceUpdate {
  return {
    name: values.name.trim(),
    config: {
      kind: "app",
      spec: {
        source: values.config.spec.source,
        port: values.config.spec.port,
        startCommand: values.config.spec.startCommand,
        instances: values.config.spec.instances,
        resources: values.config.spec.resources,
        healthCheck: values.config.spec.healthCheck,
        disks: values.config.spec.disks,
      },
    },
  };
}
