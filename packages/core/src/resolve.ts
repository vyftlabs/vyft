import type { Change } from "@vyft/engine";

import type { Context } from "./context.ts";
import {
  type DeferredTemplate,
  isDeferred,
  resolveDeferred,
} from "./interpolate.ts";
import { isRef, resolveRefs } from "./ref.ts";
import type { CreateResult, ResourceDefinition } from "./resource.ts";
import { urn } from "./urn.ts";

export interface ResolvedResult {
  externalId?: string;
  output: Record<string, unknown>;
}

function collectOutputs(ctx: Context): Record<string, unknown> {
  const outputs: Record<string, unknown> = {};
  for (const [key, value] of ctx.store.entries()) {
    const data = value as Record<string, unknown> | undefined;
    if (data?.["output"]) {
      outputs[key] = data["output"];
    }
  }
  return outputs;
}

function resolveInput(
  input: Record<string, unknown> | undefined,
  ctx: Context,
): Record<string, unknown> | undefined {
  if (!input) return input;

  const outputs = collectOutputs(ctx);
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (isDeferred(value)) {
      resolved[key] = resolveDeferred(value as DeferredTemplate, outputs);
    } else if (isRef(value) || (typeof value === "object" && value !== null)) {
      resolved[key] = resolveRefs(value, outputs);
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}

export async function resolve(
  change: Change,
  ctx: Context,
): Promise<ResolvedResult> {
  const { provider: providerName, resource: resourceName } = urn.parse(
    change.urn,
  );
  const provider = ctx.providers[providerName];
  if (!provider) {
    throw new Error(`Unknown provider: ${providerName}`);
  }

  const platformResources: Record<string, ResourceDefinition> | undefined =
    provider.config.platform;
  const resource =
    platformResources?.[resourceName] ??
    provider.config.resources?.[resourceName];
  if (!resource) {
    throw new Error(
      `Unknown resource: ${resourceName} in provider ${providerName}`,
    );
  }

  const artifacts = ctx.createArtifacts(change.urn);
  const providerCtx = await provider.config.context();

  switch (change.action) {
    case "create": {
      const fn = resource.handlers.create;
      if (!fn)
        throw new Error(`create handler not implemented for ${change.urn}`);
      const input = resolveInput(change.new?.input, ctx);
      const result: CreateResult = await fn({
        input,
        ctx: providerCtx,
        artifacts,
      });
      const resolved: ResolvedResult = { output: result.output };
      if (result.externalId) {
        resolved.externalId = result.externalId;
      }
      return resolved;
    }
    case "update": {
      const fn = resource.handlers.update;
      if (!fn)
        throw new Error(`update handler not implemented for ${change.urn}`);
      const input = resolveInput(change.new?.input, ctx);
      const old = resolveInput(change.old?.input, ctx);
      const output = await fn({
        input,
        old,
        ctx: providerCtx,
        artifacts,
      });
      return { output };
    }
    case "delete": {
      const fn = resource.handlers.delete;
      if (!fn)
        throw new Error(`delete handler not implemented for ${change.urn}`);
      const input = resolveInput(change.old?.input, ctx);
      await fn({ input, ctx: providerCtx, artifacts });
      return { output: {} };
    }
  }
}
