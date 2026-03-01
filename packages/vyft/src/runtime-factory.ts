import type { ExtendedRuntime, RuntimeName, RuntimeOptions } from "@vyft/core";
import { docker, kubernetes, swarm } from "@vyft/runtime";

const factories: Record<
  RuntimeName,
  (opts: RuntimeOptions) => ExtendedRuntime
> = {
  docker,
  swarm,
  k8s: kubernetes,
};

/** Create an ExtendedRuntime instance for the given runtime name. */
export function createRuntime(
  name: RuntimeName,
  opts: RuntimeOptions,
): ExtendedRuntime {
  return factories[name](opts);
}
