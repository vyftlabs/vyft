import type { Change, Dispatcher } from "./types.ts";

export async function execute(
  plan: Change[][],
  dispatcher: Dispatcher,
): Promise<void> {
  for (const step of plan) {
    const results = await Promise.allSettled(
      step.map((change) => dispatcher.dispatch(change)),
    );
    const failures = results
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) => r.reason);
    if (failures.length > 0) {
      throw new AggregateError(failures, "One or more dispatches failed");
    }
  }
}
