/**
 * Compatibility wrapper around the new engine API.
 * Provides the old deploy(desired, current, runtime) interface
 * used by dev and local commands.
 */

import { parseURN } from "@vyft/core";
import type { Change } from "@vyft/engine";
import {
  execute,
  fingerprint,
  plan,
  resourceURN,
  serializeConfig,
} from "@vyft/engine";
import type { Resource } from "@vyft/primitives";
import type { ExtendedRuntime, Operation } from "@vyft/runtime";
import type { ResourceState, Store } from "@vyft/store";

function toOperation(change: Change): Operation {
  if (change.status === "remove") {
    const { id, resource: kind } = parseURN(change.urn);
    return { action: "remove", urn: change.urn, id, kind };
  }
  return {
    action: change.status === "create" ? "create" : "update",
    resource: change.resource,
  };
}

/**
 * Deploy desired resources against current state using a runtime.
 * Updates the store via WAL entries and checkpoints at the end.
 */
export async function engineDeploy(
  desired: Resource[],
  store: Store,
  runtime: ExtendedRuntime,
): Promise<void> {
  const current: ResourceState[] = [...store.state.values()];
  const changes = plan(desired, current);

  for (const level of changes) {
    await Promise.all(
      level.map(async (change) => {
        const urn =
          change.status === "remove"
            ? change.urn
            : resourceURN(change.resource);

        await store.append({
          type: "pending",
          urn,
          action:
            change.status === "create"
              ? "creating"
              : change.status === "modify"
                ? "updating"
                : "deleting",
        });

        await execute(change, async (c) => {
          await runtime.execute(toOperation(c));
        });

        if (change.status === "remove") {
          await store.append({ type: "removed", urn });
        } else {
          await store.append({
            type: "committed",
            urn,
            fingerprint: fingerprint(change.resource),
            inputs: serializeConfig(
              change.resource.kind === "provider"
                ? (change.resource.input as object)
                : (change.resource.config as object),
            ),
            outputs: runtime.runtimeState().get(change.resource.id) ?? {},
          });
        }
      }),
    );
  }

  await store.checkpoint();
}
