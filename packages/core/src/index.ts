export type { Dependable, Linkable } from "@vyft/engine";
export { type ApplyEvent, apply, type ExecuteOptions } from "./apply.ts";
export type { Context } from "./context.ts";
export { destroy } from "./destroy.ts";
export type {
  Envelope,
  SerializedDeferred,
  SerializedRef,
} from "./envelope.ts";
export { isEnvelope, sealInput, sealOutput } from "./envelope.ts";
export {
  DEFERRED,
  type DeferredTemplate,
  interpolate,
  isDeferred,
  resolveDeferred,
  type SecretDeferredTemplate,
} from "./interpolate.ts";
export { plan } from "./plan.ts";
export type { PlatformResourceName, PlatformSchemas } from "./platform.ts";
export { platformSchemas } from "./platform.ts";
export type { Provider, ProviderConfig } from "./provider.ts";
export {
  createRef,
  createSecretRef,
  isRef,
  REF,
  type Ref,
  resolveRefs,
  type SecretRef,
} from "./ref.ts";
export { refresh } from "./refresh.ts";
export { type ResolvedResult, resolve } from "./resolve.ts";
export {
  type ArtifactRef,
  type Artifacts,
  type CreateResult,
  type DiffAction,
  type DiffArgs,
  type DiffResult,
  type HandlerArgs,
  type HandlerName,
  type Handlers,
  type ResourceDefinition,
  type ResourceEntry,
  type ResourceOptions,
  type ResourceRef,
  resource,
  type UpdateArgs,
} from "./resource.ts";
export {
  Cipher,
  type EncryptedSecret,
  generateSalt,
  isSecret,
  SECRET,
  secret,
  unwrap,
} from "./secret.ts";
export { StateBuilder, toState, transform } from "./transform.ts";
export { urn } from "./urn.ts";
