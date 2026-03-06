import type { State } from "@vyft/engine";
import type { Store } from "@vyft/store";
import type { Context } from "./context.ts";
import type { ResourceDefinition } from "./resource.ts";
import { urn } from "./urn.ts";

export async function refresh(
  current: State,
  store: Store,
  ctx: Context,
): Promise<void> {
  for (const [key, value] of Object.entries(current.entries)) {
    const { provider: providerName, resource: resourceName } = urn.parse(key);
    const provider = ctx.providers[providerName];
    if (!provider) continue;

    const platformResources = provider.config.platform as
      | Record<string, ResourceDefinition>
      | undefined;
    const resource =
      platformResources?.[resourceName] ??
      provider.config.resources?.[resourceName];
    if (!resource?.handlers.read) continue;

    const providerCtx = await provider.config.context();
    const artifacts = ctx.createArtifacts(key);
    const output = await resource.handlers.read({
      input: value,
      ctx: providerCtx,
      artifacts,
    });

    await store.append({ type: "set", key, data: output });
  }
}
