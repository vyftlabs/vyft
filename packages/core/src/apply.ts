import { execute, type Result, type State } from "@vyft/engine";
import type { Store } from "@vyft/store";
import type { Context } from "./context.ts";
import { plan } from "./plan.ts";
import { resolve } from "./resolve.ts";

export async function apply(
  desired: State,
  current: State,
  store: Store,
  ctx: Context,
): Promise<Result[]> {
  const steps = await plan(desired, current, ctx);

  return execute(steps, {
    async dispatch(change) {
      const handler = resolve(change, ctx);

      await store.append({
        type: "set",
        key: change.urn,
        data: {
          status: "pending",
          action: change.action,
          input: change.new ?? change.old,
        },
      });

      const output = await handler();

      await store.append({
        type: "set",
        key: change.urn,
        data: {
          status: "committed",
          action: change.action,
          input: change.new,
          output,
        },
      });

      return { change, output };
    },
  });
}
