import {
  type PlatformResourceName,
  type Provider,
  type ProviderConfig,
  platformSchemas,
  type ResourceDefinition,
} from "@vyft/core";

function validatePlatform<TCtx>(
  platform: Record<string, ResourceDefinition<unknown, TCtx>>,
): void {
  const required = Object.keys(platformSchemas) as PlatformResourceName[];
  const missing = required.filter((key) => !(key in platform));
  if (missing.length > 0) {
    throw new Error(
      `Platform is missing required resources: ${missing.join(", ")}`,
    );
  }
}

export function createProvider<TCtx>(
  config: ProviderConfig<TCtx>,
): Provider<TCtx> {
  if (config.platform !== undefined) {
    validatePlatform(config.platform);
  }
  return { config };
}
