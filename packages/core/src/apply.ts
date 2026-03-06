import { execute, type Result, type State } from "@vyft/engine";
import type { Context } from "./context.ts";
import { plan } from "./plan.ts";
import { resolve } from "./resolve.ts";

export async function apply(
  desired: State,
  current: State,
  ctx: Context,
): Promise<Result[]> {
  const steps = await plan(desired, current, ctx);

  return execute(steps, {
    async dispatch(change) {
      await ctx.store.append({
        type: "set",
        key: change.urn,
        data: {
          status: "pending",
          action: change.action,
          input: change.new?.input ?? change.old?.input,
        },
      });

      const result = await resolve(change, ctx);

      await ctx.store.append({
        type: "set",
        key: change.urn,
        data: {
          status: "committed",
          action: change.action,
          input: change.new?.input,
          externalId: result.externalId,
          output: result.output,
        },
      });

      const ret: Result = { change, output: result.output };
      if (result.externalId) {
        ret.externalId = result.externalId;
      }
      return ret;
    },
  });
}
