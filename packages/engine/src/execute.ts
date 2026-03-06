import type { Change, Dispatcher, Result } from "./types.ts";

export async function execute<T>(
  plan: Change<T>[][],
  dispatcher: Dispatcher<T>,
): Promise<Result<T>[]> {
  const results: Result<T>[] = [];

  for (const step of plan) {
    const stepResults = await Promise.all(
      step.map((change) => dispatcher.dispatch(change)),
    );
    results.push(...stepResults);
  }

  return results;
}
