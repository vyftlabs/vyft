import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sandbox } from "../src/sandbox.ts";

describe("basic deploy lifecycle", () => {
  it("deploy creates state, destroy cleans up", async () => {
    await using box = await sandbox();

    // Write a minimal package.json for project name resolution
    await box.fs.write("package.json", { name: "e2e-test" });

    // Write a config that uses @vyft/std file resource
    await box.fs.write(
      "vyft.config.ts",
      `
import { resource } from "vyft";
import { createProvider } from "@vyft/provider";
import { z } from "zod";

const provider = createProvider({
  context: async () => ({}),
  resources: {
    noop: {
      schema: z.object({ value: z.string() }),
      handlers: {
        async create({ input }) {
          return { output: { value: input.value } };
        },
        async delete() {},
      },
    },
  },
});

const noop = resource("test", provider, "noop", (_id: string, config: { value: string }) => config);

export const hello = noop("hello", { value: "world" });
`,
    );

    // Deploy
    const deployResult = await box.vyft.raw("deploy");
    assert.equal(deployResult.code, 0, `deploy failed: ${deployResult.stderr}`);

    // Verify state directory was created
    const stateExists = await box.fs.exists(
      `.vyft/${box.id}/e2e-test/production/state.json`,
    );
    assert.equal(stateExists, true, "state.json should exist after deploy");

    // Read state and verify content
    const stateRaw = await box.fs.read(
      `.vyft/${box.id}/e2e-test/production/state.json`,
    );
    const state = JSON.parse(stateRaw);
    const keys = Object.keys(state);
    assert.equal(keys.length, 1, "should have one entry");
    assert.ok(
      keys[0].includes("noop:hello"),
      `key should contain noop:hello, got: ${keys[0]}`,
    );

    // Destroy
    const destroyResult = await box.vyft.raw("destroy");
    assert.equal(
      destroyResult.code,
      0,
      `destroy failed: ${destroyResult.stderr}`,
    );
  });
});
