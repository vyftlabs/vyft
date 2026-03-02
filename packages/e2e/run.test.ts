import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { describe, test } from "node:test";
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

// Auto-discover and register all test files in cases/
const dirname = import.meta.dirname;
if (!dirname) throw new Error("import.meta.dirname is undefined");
const casesDir = join(dirname, "cases");
const files = await readdir(casesDir);

describe("e2e", { concurrency: true }, async () => {
  for (const file of files) {
    if (!file.endsWith(".ts")) continue;

    const name = basename(file, ".ts");
    const mod = await import(`./cases/${file}`);
    const tests = collectTests(mod);

    if (tests.length === 0) continue;

    describe(name, { concurrency: true }, () => {
      for (const testCase of tests) {
        if (testCase.skip) continue;

        test(
          testCase.name,
          { timeout: testCase.timeout ?? DEFAULT_TIMEOUT },
          async () => {
            const { ctx, cleanup } = await createContext({
              env: testCase.env,
              config: testCase.config,
            });

            try {
              await testCase.run(ctx);
            } finally {
              await cleanup();
            }
          },
        );
      }
    });
  }
});
