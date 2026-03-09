import type { Context } from "./context.ts";
import { sealOutput } from "./envelope.ts";
import type { ResourceDefinition } from "./resource.ts";
import { urn } from "./urn.ts";

/**
 * Reconciles pending store entries before planning.
 *
 * `dispatch()` writes `status:"pending"` before calling the provider, then
 * overwrites with `status:"committed"` on success. If the process is
 * interrupted between those two writes the WAL is replayed on the next
 * `Store.open()` and the entry is left pending. `buildCurrentState()` skips
 * pending entries, so the planner would issue a fresh "create" — potentially
 * double-creating a resource the provider already made.
 *
 * This function resolves every pending entry so that none remain after it
 * returns:
 *
 *   - read handler succeeds   → promote to "committed" with live output
 *   - read handler throws     → resource absent, remove entry (planner recreates)
 *   - no read handler         → ephemeral resource (one-shot job, exec, file
 *                               snapshot); remove entry so the planner can
 *                               re-issue create on the next run
 *   - unknown provider/resource → remove entry
 */
export async function reconcile(ctx: Context): Promise<void> {
  for (const [key, value] of ctx.store.entries()) {
    const data = value as Record<string, unknown>;
    if (data["status"] !== "pending") continue;

    const parsed = urn.parse(key);
    const provider = ctx.providers[parsed.provider];

    if (!provider) {
      await ctx.store.append({ type: "remove", key });
      continue;
    }

    const platformResources = provider.config.platform as
      | Record<string, ResourceDefinition>
      | undefined;
    const resource =
      platformResources?.[parsed.resource] ??
      provider.config.resources?.[parsed.resource];

    if (!resource) {
      await ctx.store.append({ type: "remove", key });
      continue;
    }

    const readFn = resource.handlers.read;
    if (!readFn) {
      // Ephemeral resources have no stable state to query. Remove so the
      // planner can re-issue create on the next run.
      await ctx.store.append({ type: "remove", key });
      continue;
    }

    const input = data["input"] as Record<string, unknown> | undefined;
    const providerCtx = await provider.config.context();
    const artifacts = ctx.createArtifacts(key);

    try {
      const output = await readFn({
        input,
        ctx: Object.assign({}, providerCtx, { artifacts }),
      });
      const sealed = await sealOutput(output, ctx.cipher);
      await ctx.store.append({
        type: "set",
        key,
        data: { ...data, status: "committed", output: sealed },
      });
    } catch {
      // Resource does not exist (or could not be verified). Remove so the
      // planner issues a fresh create on the next run.
      await ctx.store.append({ type: "remove", key });
    }
  }
}
