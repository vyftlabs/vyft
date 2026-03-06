import type { State } from "@vyft/engine";
import { apply, type ExecuteOptions } from "./apply.ts";
import type { Context } from "./context.ts";

export async function destroy(
  current: State,
  ctx: Context,
  options?: ExecuteOptions,
): Promise<void> {
  const empty: State = { entries: {} };
  return apply(empty, current, ctx, options);
}
