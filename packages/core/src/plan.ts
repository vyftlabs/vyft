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
  const resolved: Change[] = [];

  for (const step of steps) {
    for (const change of step) {
      if (change.action === "update") {
        const { provider: providerName, resource: resourceName } = urn.parse(
          change.urn,
        );
        const provider = ctx.providers[providerName];
        const platformResources = provider?.config.platform as
          | Record<string, ResourceDefinition>
          | undefined;
        const resource =
          platformResources?.[resourceName] ??
          provider?.config.resources?.[resourceName];
        const diffHandler = resource?.handlers.diff;

        if (diffHandler) {
          const artifacts = ctx.createArtifacts(change.urn);
          const result = await diffHandler({
            old: change.old,
            new: change.new,
            artifacts,
          });
          switch (result.action) {
            case "none":
              break;
            case "update":
              resolved.push(change);
              break;
            case "recreate":
              resolved.push({
                urn: change.urn,
                action: "delete",
                old: change.old,
              });
              resolved.push({
                urn: change.urn,
                action: "create",
                new: change.new,
              });
              break;
          }
        } else {
          resolved.push(change);
        }
      } else {
        resolved.push(change);
      }
    }
  }

  return resolved.map((change) => [change]);
}
