// URN

// Binding types
export type {
  Binding,
  BindValue,
  ConfigOptions,
  SecretOutput,
  VariableOptions,
} from "./primitives.ts";
export { bindable, isSecretOutput, secret } from "./primitives.ts";

// Ref types and utilities
export type {
  ConfigRef,
  EnvValue,
  Interpolation,
  OutputRef,
  Reference,
  SecretRef,
  SecretValue,
  VariableRef,
} from "./ref.ts";
export { interpolate, isInterpolation, isReference } from "./ref.ts";
// Resource types, symbols, and validation
export type {
  BindMount,
  BuildConfig,
  Config,
  ConfigConfig,
  CronJob,
  CronJobConfig,
  Dependable,
  GeneratedSecretConfig,
  HealthCheck,
  Job,
  JobConfig,
  Linkable,
  Mountable,
  PlainConfigConfig,
  PlainVariableConfig,
  ProvidedSecretConfig,
  ProviderResource,
  ReadyFn,
  ReadyRuntime,
  Resource,
  ResourceOptions,
  Secret,
  SecretConfig,
  Service,
  ServiceConfig,
  Variable,
  VariableConfig,
  Volume,
  VolumeConfig,
} from "./resource.ts";
export {
  INTERNAL,
  isSecretConfig,
  isSecretVariable,
  MOUNTABLE,
  validateCron,
  validateDuration,
  validateId,
  validateRoute,
} from "./resource.ts";
export type { URN } from "./urn.ts";
export { buildURN, parseURN } from "./urn.ts";
