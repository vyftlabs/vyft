import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { describe, it } from "node:test";
import { createContext } from "./src/context.ts";
import { DEFAULT_TIMEOUT, type TestDefinition } from "./src/test.ts";

function isTestDefinition(value: unknown): value is TestDefinition {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    "run" in value &&
    typeof (value as TestDefinition).run === "function"
  );
}

function collectTests(mod: Record<string, unknown>): TestDefinition[] {
  const tests: TestDefinition[] = [];
  for (const value of Object.values(mod)) {
    if (isTestDefinition(value)) {
      tests.push(value);
    }
  }
  return tests;
}

// Limit concurrency to avoid exhausting Docker network pools
// Each test creates Docker resources, so we limit parallel execution
const CONCURRENCY = Number(process.env.E2E_CONCURRENCY) || 4;

// Auto-discover and register all test files in cases/
const dirname = import.meta.dirname;
if (!dirname) throw new Error("import.meta.dirname is undefined");
const casesDir = join(dirname, "cases");
const files = await readdir(casesDir);

describe("e2e", { concurrency: CONCURRENCY, timeout: 300_000 }, async () => {
  for (const file of files) {
    if (!file.endsWith(".ts")) continue;

    const name = basename(file, ".ts");
    const mod = await import(`./cases/${file}`);
    const tests = collectTests(mod);

    if (tests.length === 0) continue;

    describe(name, { concurrency: CONCURRENCY }, () => {
      for (const testCase of tests) {
        it(
          testCase.name,
          {
            timeout: testCase.timeout ?? DEFAULT_TIMEOUT,
          },
          async () => {
            // Setup: Create test context with isolated environment
            const { ctx, cleanup } = await createContext({
              env: testCase.env,
              config: testCase.config,
            });

            try {
              // Execute the test
              await testCase.run(ctx);
            } finally {
              // Teardown: Clean up Docker resources and temp files
              await cleanup();
            }
          },
        );
      }
    });
  }
});
