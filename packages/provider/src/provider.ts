import type { ProviderContext } from "./context.ts";
import type { Module } from "./module.ts";
import type { ResourceDefinition } from "./resource.ts";

export type ResolvedResource = {
  readonly urn: string;
  readonly definition: ResourceDefinition;
};

/**
 * Assemble a provider from a context, modules, and standalone resources.
 *
 * URNs are derived automatically:
 * - Module resources: `vyft:{namespace}:{key}:{provider}`
 * - Standalone resources: `vyft:{provider}:{name}`
 *
 * @example
 * ```ts
 * export default defineProvider({
 *   context,
 *   modules: [platform],
 * });
 * ```
 */
export function defineProvider(options: {
  context: ProviderContext;
  modules?: Module[];
  resources?: ResourceDefinition[];
}) {
  const providerName = options.context.name;
  const resolved: ResolvedResource[] = [];

  if (options.modules) {
    for (const mod of options.modules) {
      for (const [key, definition] of Object.entries(mod.resources)) {
        const urn = `vyft:${mod.namespace}:${key}:${providerName}`;
        resolved.push({ urn, definition: definition as ResourceDefinition });
      }
    }
  }

  if (options.resources) {
    for (const res of options.resources) {
      const urn = `vyft:${providerName}:${res.name}`;
      resolved.push({ urn, definition: res });
    }
  }

  return { ...options, resolved };
}
