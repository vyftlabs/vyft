import type { Change, State } from "@vyft/engine";
import * as engine from "@vyft/engine";
import type { Context } from "./context.ts";
import type { ResourceDefinition } from "./resource.ts";
import { urn } from "./urn.ts";

export async function plan(
  desired: State,
  current: State,
  ctx: Context,
): Promise<Change[][]> {
  const steps = engine.plan(desired, current);
  const result: Change[][] = [];

  for (const step of steps) {
    const resolved: Change[] = [];
    const recreateDeletes: Change[] = [];

    for (const change of step) {
      if (change.action === "update") {
        const oldEntry = current.entries[change.urn];
        const newEntry = desired.entries[change.urn];
        if (!oldEntry || !newEntry) {
          resolved.push(change);
          continue;
        }

        const { provider: providerName, resource: resourceName } = urn.parse(
          change.urn,
        );
        const provider = ctx.providers[providerName];
        const platformResources:
          | Record<string, ResourceDefinition>
          | undefined = provider?.config.platform;
        const resource =
          platformResources?.[resourceName] ??
          provider?.config.resources?.[resourceName];
        const diffHandler = resource?.handlers.diff;

        if (diffHandler) {
          const artifacts = ctx.createArtifacts(change.urn);
          const diffResult = await diffHandler({
            old: oldEntry.input,
            new: newEntry.input,
            ctx: { artifacts },
          });
          switch (diffResult.action) {
            case "none":
              break;
            case "update":
              resolved.push(change);
              break;
            case "recreate":
              recreateDeletes.push({ urn: change.urn, action: "delete" });
              resolved.push({ urn: change.urn, action: "create" });
              break;
          }
        } else {
          resolved.push(change);
        }
      } else {
        resolved.push(change);
      }
    }

    if (recreateDeletes.length > 0) {
      result.push(recreateDeletes);
    }
    if (resolved.length > 0) {
      result.push(resolved);
    }
  }

  return result;
}
