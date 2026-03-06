import type { Change, Dispatcher } from "./types.ts";

export async function execute(
  plan: Change[][],
  dispatcher: Dispatcher,
): Promise<void> {
  for (const step of plan) {
    await Promise.all(step.map((change) => dispatcher.dispatch(change)));
  }
}
