import { type Action, execute, type State } from "@vyft/engine";
import type { Context } from "./context.ts";
import { plan } from "./plan.ts";
import { type ResolvedResult, resolve } from "./resolve.ts";

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
      output: unknown;
    }
  | {
      status: "failed";
      urn: string;
      action: Action;
      error: unknown;
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

  // Collect URNs in the plan so we can detect unchanged resources
  const planned = new Set<string>();
  for (const step of steps) {
    for (const change of step) {
      planned.add(change.urn);
    }
  }

  // Emit "committed" for resources unchanged by the plan
  for (const urn of Object.keys(desired.entries)) {
    if (!planned.has(urn) && urn in current.entries) {
      options?.onEvent?.({
        status: "committed",
        urn,
        action: "update",
        input: desired.entries[urn]?.input,
        output: current.entries[urn]?.output,
      });
    }
  }

  await execute(steps, {
    async dispatch(change) {
      const input =
        desired.entries[change.urn]?.input ??
        current.entries[change.urn]?.input;

      options?.onEvent?.({
        status: "pending",
        urn: change.urn,
        action: change.action,
        input,
      });

      let result: ResolvedResult | undefined;
      try {
        result = await resolve(change, desired, current, ctx);
      } catch (err) {
        options?.onEvent?.({
          status: "failed",
          urn: change.urn,
          action: change.action,
          error: err,
        });
        throw err;
      }

      if (result.skipped) {
        options?.onEvent?.({
          status: "committed",
          urn: change.urn,
          action: change.action,
          input,
          output: current.entries[change.urn]?.output,
        });
        return;
      }

      if (change.action === "delete") {
        await ctx.store.append({ type: "remove", key: change.urn });
        options?.onEvent?.({
          status: "committed",
          urn: change.urn,
          action: "delete",
          input: current.entries[change.urn]?.input,
          output: {},
        });
      } else {
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
