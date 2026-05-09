import type { AppSpec, Resource } from "@vyft/spec";

export function getAppSpec(r: Resource): AppSpec | null {
  if (r.config.kind !== "app") return null;
  return r.config.spec;
}
