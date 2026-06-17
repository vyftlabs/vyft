import type { Resource, ResourceRedisCreate, ResourceUpdate } from "@vyft/spec";
import { getRedisSpec } from "@/lib/resource";

// fromRedisResource builds RHF defaults for the redis form — from an existing
// resource, or small/hobby defaults when creating (single node, 0.25 core /
// 256 MiB, ephemeral). storage 0 = no PVC (cache); >0 enables AOF persistence.
export function fromRedisResource(resource?: Resource): ResourceRedisCreate {
  const spec = resource ? getRedisSpec(resource) : null;
  return {
    name: resource?.name ?? "",
    positionX: resource?.positionX ?? 0,
    positionY: resource?.positionY ?? 0,
    config: {
      kind: "redis",
      spec: {
        version: spec?.version ?? "7",
        storage: spec?.storage ?? 0,
        resources: spec?.resources ?? { cpu: 0.25, memory: 256 },
      },
    },
  };
}

// toRedisUpdate maps form state to a PATCH body. version is immutable
// post-create (rejected server-side) but sent for completeness.
export function toRedisUpdate(values: ResourceRedisCreate): ResourceUpdate {
  return {
    name: values.name.trim(),
    config: { kind: "redis", spec: values.config.spec },
  };
}
