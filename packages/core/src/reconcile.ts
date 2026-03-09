import type { ApplyEvent } from "./apply.ts";
import type { Context } from "./context.ts";
import { sealOutput } from "./envelope.ts";
import type { ResourceDefinition } from "./resource.ts";
import { urn } from "./urn.ts";

/**
 * Reconcile pending store entries before planning.
 *
 * On a previous deploy, `dispatch()` writes `status: "pending"` before
 * calling the provider. If the process crashed after the provider created
 * the resource but before the "committed" write, the store retains the
 * pending entry. `buildCurrentState()` skips pending entries, so the next
 * plan would issue a fresh "create" — potentially duplicating the resource.
 *
 * This function scans for pending entries and, for each one, calls the
 * provider's `read` handler to determine what actually exists:
 *   - read succeeds  → promote the entry to "committed" using the live output
 *   - read throws    → remove the entry (resource was never created; will be recreated)
 *   - no read handler → skip (left as pending; treated as missing by planner)
 *     TODO: decide whether to remove entries for providers without a read handler
 */
export async function reconcile(ctx: Context): Promise<void> {
  const pending: Array<[string, Record<string, unknown>]> = [];

  for (const [key, value] of ctx.store.entries()) {
    const data = value as Record<string, unknown>;
    if (data["status"] === "pending") {
      pending.push([key, data]);
    }
  }

  for (const [key, data] of pending) {
    const { provider: providerName, resource: resourceName } = urn.parse(key);
    const provider = ctx.providers[providerName];

    if (!provider) {
      await ctx.store.append({ type: "remove", key });
      continue;
    }

    const platformResources = provider.config.platform as
      | Record<string, ResourceDefinition>
      | undefined;
    const resource =
      platformResources?.[resourceName] ??
      provider.config.resources?.[resourceName];

    if (!resource?.handlers.read) {
      // TODO: refine handling for providers without a read handler
      continue;
    }

    const input = data["input"] as Record<string, unknown> | undefined;
    const providerCtx = await provider.config.context();
    const artifacts = ctx.createArtifacts(key);

    let readOutput: Record<string, unknown> | null = null;
    try {
      readOutput = await resource.handlers.read({
        input,
        ctx: Object.assign({}, providerCtx, { artifacts }),
      });
    } catch {
      readOutput = null;
    }

    if (readOutput === null) {
      await ctx.store.append({ type: "remove", key });
    } else {
      const output = await sealOutput(readOutput, ctx.cipher);
      const action = (data["action"] as ApplyEvent["action"]) ?? "create";
      const promoted: ApplyEvent = {
        status: "committed",
        urn: key,
        action,
        input,
        output,
      };
      await ctx.store.append({ type: "set", key, data: promoted });
    }
  }
}
