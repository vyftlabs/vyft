import type { State } from "@vyft/engine";
import type { Context } from "./context.ts";
import { plan } from "./plan.ts";
import { resolve } from "./resolve.ts";

export interface ApplyEvent {
  urn: string;
  action: string;
  status: "pending" | "committed" | "failed";
  externalId?: string;
  output?: Record<string, unknown>;
  error?: Error;
}

export interface ApplyOptions {
  onEvent?: (event: ApplyEvent) => void;
}

export async function apply(
  desired: State,
  current: State,
  ctx: Context,
  options?: ApplyOptions,
): Promise<void> {
  const steps = await plan(desired, current, ctx);

  for (const step of steps) {
    await Promise.all(
      step.map(async (change) => {
        const input =
          desired.entries[change.urn]?.input ??
          current.entries[change.urn]?.input;

        await ctx.store.append({
          type: "set",
          key: change.urn,
          data: { status: "pending", action: change.action, input },
        });

        options?.onEvent?.({
          urn: change.urn,
          action: change.action,
          status: "pending",
        });

        const result = await resolve(change, desired, current, ctx);

        await ctx.store.append({
          type: "set",
          key: change.urn,
          data: {
            status: "committed",
            action: change.action,
            input: desired.entries[change.urn]?.input,
            externalId: result.externalId,
            output: result.output,
          },
        });

        const committed: ApplyEvent = {
          urn: change.urn,
          action: change.action,
          status: "committed",
          output: result.output,
        };
        if (result.externalId) {
          committed.externalId = result.externalId;
        }
        options?.onEvent?.(committed);
      }),
    );
  }
}
