import type { TestContext } from "./context.ts";

/** Default timeout for e2e tests (2 minutes) */
export const DEFAULT_TIMEOUT = 120_000;

export interface TestDefinition {
  name: string;
  skip?: boolean;
  timeout?: number;
  env?: Record<string, string>;
  config?: string;
  run: (ctx: TestContext) => Promise<void>;
}

export function test(definition: TestDefinition): TestDefinition {
  return definition;
}
