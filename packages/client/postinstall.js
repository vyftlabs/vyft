import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const cwd = process.env.INIT_CWD || process.cwd();
const outputDir = join(cwd, "node_modules", "@types", "vyft__client");

try {
  const { generate } = await import("@vyft/core/client-generate");
  await generate(cwd);
} catch {
  // No config found or @vyft/core not available — write the stub.
  const dts = [
    'declare module "@vyft/client" {',
    "  export const bindings: Record<string, Record<string, string>>;",
    "  export const env: { readonly PORT: string; readonly NODE_ENV: string };",
    "}",
    "",
  ].join("\n");

  await mkdir(outputDir, { recursive: true });
  await writeFile(
    join(outputDir, "package.json"),
    JSON.stringify({ name: "@types/vyft__client", version: "0.0.0" }),
  );
  await writeFile(join(outputDir, "index.d.ts"), dts);
}
