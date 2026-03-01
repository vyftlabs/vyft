import type { ExtendedRuntime, RuntimeName, RuntimeOptions } from "@vyft/core";
import { createDockerRuntime } from "@vyft/docker";
import { createK8sRuntime } from "@vyft/kubernetes";
import { createSwarmRuntime } from "@vyft/swarm";

const factories: Record<
  RuntimeName,
  (opts: RuntimeOptions) => ExtendedRuntime
> = {
  docker: createDockerRuntime,
  swarm: createSwarmRuntime,
  k8s: createK8sRuntime,
};

/** Create an ExtendedRuntime instance for the given runtime name. */
export function createRuntime(
  name: RuntimeName,
  opts: RuntimeOptions,
): ExtendedRuntime {
  return factories[name](opts);
}
