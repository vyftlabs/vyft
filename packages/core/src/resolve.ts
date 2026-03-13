import type { Change, State } from "@vyft/engine";

import type { Context } from "./context.ts";
import { inputDiff } from "./diff.ts";
import { resolveValue, sealOutput } from "./envelope.ts";
import type { CreateResult, ResourceDefinition } from "./resource.ts";
import { urn } from "./urn.ts";

export interface ResolvedResult {
  externalId?: string;
  output: unknown;
  skipped?: boolean;
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

async function resolveInput(
  input: Record<string, unknown> | undefined,
  ctx: Context,
): Promise<Record<string, unknown> | undefined> {
  if (!input) return input;

  const outputs = collectOutputs(ctx);
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    resolved[key] = await resolveValue(value, outputs, ctx.cipher);
  }
  return resolved;
}

export async function resolve(
  change: Change,
  desired: State,
  current: State,
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
      const input = await resolveInput(desired.entries[change.urn]?.input, ctx);
      const result: CreateResult = await fn({
        input,
        ctx: Object.assign({}, providerCtx, { artifacts }),
      });
      const output = await sealOutput(result.output, ctx.cipher);
      const resolved: ResolvedResult = { output };
      if (result.externalId) {
        resolved.externalId = result.externalId;
      }
      return resolved;
    }
    case "update": {
      // Diff uses sealed inputs — avoids resolving refs that may have been deleted
      const sealedNew = desired.entries[change.urn]?.input ?? {};
      const sealedOld = current.entries[change.urn]?.input ?? {};

      const diffFn = resource.handlers.diff ?? inputDiff;
      const { action } = await diffFn({
        old: sealedOld,
        new: sealedNew,
        ctx: { artifacts },
      });

      if (action === "none") {
        return { output: undefined, skipped: true };
      }

      if (action === "recreate") {
        if (resource.handlers.delete) {
          const oldInput = await resolveInput(
            current.entries[change.urn]?.input,
            ctx,
          ).catch(() => current.entries[change.urn]?.input);
          await resource.handlers.delete({
            input: oldInput,
            ctx: Object.assign({}, providerCtx, { artifacts }),
          });
        }
        const createFn = resource.handlers.create;
        if (!createFn)
          throw new Error(`create handler not implemented for ${change.urn}`);
        const input = await resolveInput(
          desired.entries[change.urn]?.input,
          ctx,
        );
        const result: CreateResult = await createFn({
          input,
          ctx: Object.assign({}, providerCtx, { artifacts }),
        });
        const output = await sealOutput(result.output, ctx.cipher);
        const resolved: ResolvedResult = { output };
        if (result.externalId) {
          resolved.externalId = result.externalId;
        }
        return resolved;
      }

      const fn = resource.handlers.update;
      if (!fn)
        throw new Error(`update handler not implemented for ${change.urn}`);
      const input = await resolveInput(desired.entries[change.urn]?.input, ctx);
      const old = await resolveInput(current.entries[change.urn]?.input, ctx);
      const rawOutput = await fn({
        input,
        old,
        ctx: Object.assign({}, providerCtx, { artifacts }),
      });
      const output = await sealOutput(rawOutput, ctx.cipher);
      return { output };
    }
    case "delete": {
      const fn = resource.handlers.delete;
      if (fn) {
        const input = await resolveInput(
          current.entries[change.urn]?.input,
          ctx,
        );
        await fn({ input, ctx: Object.assign({}, providerCtx, { artifacts }) });
      }
      return { output: {} };
    }
  }
}
