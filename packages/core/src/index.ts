export { collect, currentCollector, currentParent } from "./collector.ts";
export type { ContextConfig, ProjectInfo, RuntimeName } from "./config.ts";
export {
  findConfig,
  loadConfig,
  loadContextConfig,
  projectInfo,
  RUNTIMES,
  resolveContext,
  resolveStage,
  saveContextConfig,
  vyftRoot,
} from "./config.ts";
export { changedFields, hasSpecChange, NON_SPEC_FIELDS } from "./diff.ts";
export {
  durationToMs,
  durationToNanos,
  durationToSeconds,
  nanosToDigits,
} from "./duration.ts";
export { loadEnv, parseEnv } from "./env.ts";
export { CliError } from "./errors.ts";
export { generateSecret } from "./generate.ts";
export { buildImage, imageDigest, pullImage, pushImage } from "./image.ts";
export type {
  DeployResult,
  DestroyResult,
  DiffResult,
  PreviewChange,
  RefreshResult,
} from "./orchestrate.ts";
export { deploy, destroy, diff, preview, refresh } from "./orchestrate.ts";
export * from "./platform.ts";
export { resolve, resolveEnv } from "./resolve.ts";

// Re-exports from @vyft/primitives for backward compatibility
export type {
  BindMount,
  Binding,
  BindValue,
  Config,
  ConfigConfig,
  ConfigOptions,
  ConfigRef,
  CronJob,
  CronJobConfig,
  Dependable,
  EnvValue,
  GeneratedSecretConfig,
  HealthCheck,
  Interpolation,
  Job,
  JobConfig,
  Linkable,
  Mountable,
  OutputRef,
  PlainConfigConfig,
  PlainVariableConfig,
  ProvidedSecretConfig,
  ProviderResource,
  ReadyFn,
  ReadyRuntime,
  Reference,
  Resource,
  ResourceOptions,
  Secret,
  SecretConfig,
  SecretOutput,
  SecretRef,
  SecretValue,
  Service,
  ServiceConfig,
  URN,
  Variable,
  VariableConfig,
  VariableOptions,
  VariableRef,
  Volume,
  VolumeConfig,
} from "@vyft/primitives";
export {
  bindable,
  buildURN,
  INTERNAL,
  interpolate,
  isInterpolation,
  isReference,
  isSecretConfig,
  isSecretOutput,
  isSecretVariable,
  MOUNTABLE,
  parseURN,
  secret,
  validateCron,
  validateDuration,
  validateId,
  validateRoute,
} from "@vyft/primitives";

// Re-exports from @vyft/store for backward compatibility
export type { ResourceState } from "@vyft/store";

// Re-exports from @vyft/errors for backward compatibility
export { ValidationError } from "@vyft/errors";
