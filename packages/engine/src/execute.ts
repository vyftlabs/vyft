import { logger } from "@vyft/logger";
import { parseURN } from "@vyft/primitives";
import type { Change } from "./plan.ts";

const log = logger.child("engine");

/** Extract the resource ID from a change. */
export function changeId(change: Change): string {
  if (change.status === "remove") {
    return parseURN(change.urn).id;
  }
  return change.resource.id;
}

/** Execute a single change by calling the handler. */
export async function execute(
  change: Change,
  handler: (change: Change) => Promise<void>,
): Promise<void> {
  const id = changeId(change);
  log.info(`${change.status} ${id}`);
  await handler(change);
}
