export {
  type ArtifactRef,
  type Artifacts,
  type DiffAction,
  type DiffArgs,
  type DiffResult,
  type HandlerArgs,
  type HandlerName,
  type Handlers,
  inputDiff,
  type PlatformResourceName,
  type Provider,
  type ProviderConfig,
  RESOURCE,
  type Resource,
  type ResourceDefinition,
  type UpdateArgs,
} from "@vyft/core";
export { defineResource } from "./define.ts";
export {
  type CreateProviderConfig,
  createProvider,
  type ResourceTree,
  type ToConstructors,
} from "./provider.ts";
