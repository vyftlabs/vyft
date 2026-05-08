import type { AppSpec, Resource } from "@vyft/spec";

export function getAppSpec(r: Resource): AppSpec | null {
  if (r.category !== "service") return null;
  if (r.service.kind !== "app") return null;
  return r.service.spec;
}
