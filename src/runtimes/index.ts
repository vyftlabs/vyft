import type { RuntimeName } from "../config.ts";
import { createDockerRuntime } from "./docker/index.ts";
import { createK8sRuntime } from "./k8s/index.ts";
import { createSwarmRuntime } from "./swarm/index.ts";
import type { ExtendedRuntime, RuntimeOptions } from "./types.ts";

export type { ExtendedRuntime, Runtime, RuntimeOptions } from "./types.ts";

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
