import type { State } from "@vyft/engine";
import type { Context } from "./context.ts";
import { sealOutput } from "./envelope.ts";
import type { ResourceDefinition } from "./resource.ts";
import { urn } from "./urn.ts";

export async function refresh(current: State, ctx: Context): Promise<void> {
  for (const [key, entry] of Object.entries(current.entries)) {
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
      input: entry.input,
      ctx: Object.assign({}, providerCtx, { artifacts }),
    });

    const sealed = await sealOutput(output, ctx.cipher);
    const existing = ctx.store.get(key) as Record<string, unknown>;
    await ctx.store.append({
      type: "set",
      key,
      data: { ...existing, output: sealed },
    });
  }
}
