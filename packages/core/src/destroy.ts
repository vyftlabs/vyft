import type { State } from "@vyft/engine";
import { type ApplyOptions, apply } from "./apply.ts";
import type { Context } from "./context.ts";

export async function destroy(
  current: State,
  ctx: Context,
  options?: ApplyOptions,
): Promise<void> {
  const empty: State = { entries: {} };
  return apply(empty, current, ctx, options);
}
