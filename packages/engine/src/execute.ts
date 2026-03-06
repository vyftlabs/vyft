import type { Change, Dispatcher, Result } from "./types.ts";

export async function execute(
  plan: Change[][],
  dispatcher: Dispatcher,
): Promise<Result[]> {
  const results: Result[] = [];

  for (const step of plan) {
    const stepResults = await Promise.all(
      step.map((change) => dispatcher.dispatch(change)),
    );
    results.push(...stepResults);
  }

  return results;
}
