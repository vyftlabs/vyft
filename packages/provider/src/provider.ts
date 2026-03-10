import {
  createConstructor,
  type PlatformResourceName,
  type Provider,
  RESOURCE,
  type Resource,
  type ResourceDefinition,
  type ResourceOptions,
} from "@vyft/core";

// biome-ignore lint/suspicious/noExplicitAny: resource definitions have varying input types
type AnyResourceDefinition = ResourceDefinition<any, any, any>;

/** A leaf resource or a nested namespace of resources. */
export type ResourceTree =
  | AnyResourceDefinition
  | { [key: string]: ResourceTree };

/** Converts a ResourceDefinition to a callable constructor. */
type ResourceConstructor<D> =
  D extends ResourceDefinition<infer I, infer O>
    ? (id: string, input: I, options?: ResourceOptions) => Resource<O>
    : never;

/** Recursively maps a resource tree to constructor functions. */
export type ToConstructors<T> = T extends AnyResourceDefinition
  ? ResourceConstructor<T>
  : { [K in keyof T]: ToConstructors<T[K]> };

export interface CreateProviderConfig<
  TCtx,
  TResources extends Record<string, ResourceTree>,
> {
  name: string;
  context: () => Promise<TCtx> | TCtx;
  resources: TResources;
  platform?: {
    // biome-ignore lint/suspicious/noExplicitAny: resources have varying input types
    [K in PlatformResourceName]: ResourceDefinition<any, any, TCtx>;
  };
}

function isResourceDefinition(v: unknown): v is AnyResourceDefinition {
  return (
    typeof v === "object" &&
    v !== null &&
    RESOURCE in v &&
    (v as Record<symbol, unknown>)[RESOURCE] === true
  );
}

function flattenResources(
  tree: Record<string, ResourceTree>,
  result: Record<string, AnyResourceDefinition> = {},
): Record<string, AnyResourceDefinition> {
  for (const [_key, value] of Object.entries(tree)) {
    if (isResourceDefinition(value)) {
      const name = value.name;
      if (result[name]) {
        throw new Error(`Duplicate resource name: "${name}"`);
      }
      result[name] = value;
    } else {
      flattenResources(value as Record<string, ResourceTree>, result);
    }
  }
  return result;
}

const REQUIRED_PLATFORM_RESOURCES: PlatformResourceName[] = [
  "server",
  "volume",
  "network",
];

function validatePlatform<TCtx>(
  platform: Record<string, ResourceDefinition<unknown, unknown, TCtx>>,
): void {
  const missing = REQUIRED_PLATFORM_RESOURCES.filter(
    (key) => !(key in platform),
  );
  if (missing.length > 0) {
    throw new Error(
      `Platform is missing required resources: ${missing.join(", ")}`,
    );
  }
}

function buildConstructors(
  name: string,
  provider: Provider<unknown>,
  tree: Record<string, ResourceTree>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(tree)) {
    if (isResourceDefinition(value)) {
      result[key] = createConstructor(
        name,
        provider,
        value.name,
        (id: string, config: Record<string, unknown>) => ({
          name: id,
          ...config,
        }),
      );
    } else {
      result[key] = buildConstructors(
        name,
        provider,
        value as Record<string, ResourceTree>,
      );
    }
  }
  return result;
}

export function createProvider<
  TCtx,
  TResources extends Record<string, ResourceTree>,
>(config: CreateProviderConfig<TCtx, TResources>): ToConstructors<TResources> {
  if (config.platform !== undefined) {
    validatePlatform(config.platform);
  }

  const flatResources = flattenResources(config.resources);

  const providerConfig = {
    context: config.context,
    resources: flatResources,
    ...(config.platform !== undefined ? { platform: config.platform } : {}),
  };

  const provider: Provider<TCtx> = { config: providerConfig };

  return buildConstructors(
    config.name,
    provider,
    config.resources,
  ) as ToConstructors<TResources>;
}
