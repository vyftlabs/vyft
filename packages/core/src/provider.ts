import type { PlatformResourceName } from "./platform.ts";
import type { ResourceDefinition } from "./resource.ts";

type PlatformResources<TCtx> = {
  // biome-ignore lint/suspicious/noExplicitAny: resources have varying input types
  [K in PlatformResourceName]: ResourceDefinition<any, TCtx>;
};

export interface ProviderConfig<TCtx> {
  context: () => Promise<TCtx> | TCtx;
  platform?: PlatformResources<TCtx>;
  // biome-ignore lint/suspicious/noExplicitAny: resources have varying input types
  resources?: Record<string, ResourceDefinition<any, TCtx>>;
}

export interface Provider<TCtx> {
  config: ProviderConfig<TCtx>;
}
