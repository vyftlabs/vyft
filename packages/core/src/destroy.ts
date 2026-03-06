import type { Result, State } from "@vyft/engine";
import { apply } from "./apply.ts";
import type { Context } from "./context.ts";

export async function destroy(
  current: State,
  ctx: Context,
): Promise<Result[]> {
  const empty: State = { entries: {} };
  return apply(empty, current, ctx);
}
