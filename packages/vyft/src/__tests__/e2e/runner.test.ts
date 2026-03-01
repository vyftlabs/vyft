import { readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, it } from "node:test";
import { pathToFileURL } from "node:url";
import { RUNTIMES } from "@vyft/core";
import type { TestCase } from "./harness.ts";
import { checkAvailability, runCase } from "./harness.ts";

const dirname = import.meta.dirname;
if (!dirname) throw new Error("import.meta.dirname is undefined");
const casesDir = join(dirname, "cases");
const cases = readdirSync(casesDir).filter((f) => f.endsWith(".ts"));

const MAX_CONCURRENCY = parseInt(process.env["E2E_CONCURRENCY"] ?? "3", 10);

const runtimes = await Promise.all(
  RUNTIMES.map(async (name) => ({
    name,
    available: await checkAvailability(name),
  })),
);

for (const rt of runtimes) {
  describe(
    rt.name,
    {
      skip: !rt.available ? `${rt.name} not available` : false,
      timeout: 300_000,
      concurrency: MAX_CONCURRENCY,
    },
    () => {
      for (const file of cases) {
        const caseName = basename(file, ".ts");
        it(caseName, { timeout: 120_000 }, async () => {
          const mod = (await import(
            pathToFileURL(join(casesDir, file)).href
          )) as TestCase;
          await runCase(rt.name, caseName, mod);
        });
      }
    },
  );
}
