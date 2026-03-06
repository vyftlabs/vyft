import { type Action, execute, type State } from "@vyft/engine";
import type { Context } from "./context.ts";
import { plan } from "./plan.ts";
import { resolve } from "./resolve.ts";

export type ApplyEvent =
  | {
      status: "pending";
      urn: string;
      action: Action;
      input: Record<string, unknown> | undefined;
    }
  | {
      status: "committed";
      urn: string;
      action: Action;
      input: Record<string, unknown> | undefined;
      externalId?: string | undefined;
      output: Record<string, unknown>;
    };

export interface ExecuteOptions {
  onEvent?: (event: ApplyEvent) => void;
}

export async function apply(
  desired: State,
  current: State,
  ctx: Context,
  options?: ExecuteOptions,
): Promise<void> {
  const steps = await plan(desired, current, ctx);

  await execute(steps, {
    async dispatch(change) {
      const input =
        desired.entries[change.urn]?.input ??
        current.entries[change.urn]?.input;

      {
        const data: ApplyEvent = {
          status: "pending",
          urn: change.urn,
          action: change.action,
          input,
        };

        await ctx.store.append({ type: "set", key: change.urn, data });
        options?.onEvent?.(data);
      }

      const result = await resolve(change, desired, current, ctx);

      {
        const data: ApplyEvent = {
          status: "committed",
          urn: change.urn,
          action: change.action,
          input: desired.entries[change.urn]?.input,
          externalId: result.externalId,
          output: result.output,
        };

        await ctx.store.append({ type: "set", key: change.urn, data });
        options?.onEvent?.(data);
      }
    },
  });
}
