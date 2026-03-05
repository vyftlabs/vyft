// Runtime types

// Runtime contracts (handler pattern)
export * from "./contracts.ts";
// Existing runtime implementations
export type { DockerRuntimeOptions } from "./docker/index.ts";
export { createDockerRuntime as docker } from "./docker/index.ts";
export type { BrandedHandler, RuntimeBuilder, RuntimeInit } from "./init.ts";
export { initRuntime } from "./init.ts";
export type { K8sRuntimeOptions } from "./kubernetes/index.ts";
export { createK8sRuntime as kubernetes } from "./kubernetes/index.ts";
export type { SwarmRuntimeOptions } from "./swarm/index.ts";
export { createSwarmRuntime as swarm } from "./swarm/index.ts";
export type {
  ExtendedRuntime,
  ImageUtils,
  Operation,
  Runtime,
  RuntimeOptions,
} from "./types.ts";
