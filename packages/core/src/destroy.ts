import type { Result, State } from "@vyft/engine";
import type { Store } from "@vyft/store";
import { apply } from "./apply.ts";
import type { Context } from "./context.ts";

export async function destroy(
  current: State,
  store: Store,
  ctx: Context,
): Promise<Result[]> {
  const empty: State = { entries: {} };
  return apply(empty, current, store, ctx);
}
