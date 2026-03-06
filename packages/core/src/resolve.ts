import type { Change } from "@vyft/engine";
import type { Context } from "./context.ts";
import type { ResourceDefinition } from "./resource.ts";
import { urn } from "./urn.ts";

export function resolve(change: Change, ctx: Context): () => Promise<unknown> {
  const { provider: providerName, resource: resourceName } = urn.parse(
    change.urn,
  );
  const provider = ctx.providers[providerName];
  if (!provider) {
    throw new Error(`Unknown provider: ${providerName}`);
  }

  const platformResources = provider.config.platform as
    | Record<string, ResourceDefinition>
    | undefined;
  const resource =
    platformResources?.[resourceName] ??
    provider.config.resources?.[resourceName];
  if (!resource) {
    throw new Error(
      `Unknown resource: ${resourceName} in provider ${providerName}`,
    );
  }

  const artifacts = ctx.createArtifacts(change.urn);

  switch (change.action) {
    case "create": {
      const fn = resource.handlers.create;
      if (!fn)
        throw new Error(`create handler not implemented for ${change.urn}`);
      return async () => {
        const providerCtx = await provider.config.context();
        return fn({ input: change.new, ctx: providerCtx, artifacts });
      };
    }
    case "update": {
      const fn = resource.handlers.update;
      if (!fn)
        throw new Error(`update handler not implemented for ${change.urn}`);
      return async () => {
        const providerCtx = await provider.config.context();
        return fn({
          input: change.new,
          old: change.old,
          ctx: providerCtx,
          artifacts,
        });
      };
    }
    case "delete": {
      const fn = resource.handlers.delete;
      if (!fn)
        throw new Error(`delete handler not implemented for ${change.urn}`);
      return async () => {
        const providerCtx = await provider.config.context();
        await fn({ input: change.old, ctx: providerCtx, artifacts });
      };
    }
  }
}
