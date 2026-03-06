import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sandbox } from "../src/sandbox.ts";

describe("basic deploy lifecycle", () => {
  it("deploy creates a service, destroy removes it", async () => {
    await using box = await sandbox();

    await box.fs.write("package.json", { name: "vyft-e2e" });

    await box.fs.write(
      "vyft.config.ts",
      `
import { service } from "vyft";

export const api = service("api", {
  image: "nginx:alpine",
  port: 80,
});
`,
    );

    // Deploy
    const deployResult = await box.vyft.raw("deploy");
    assert.equal(deployResult.code, 0, `deploy failed: ${deployResult.stderr}`);

    // Verify state was created
    const stateExists = await box.fs.exists(
      `.vyft/${box.id}/vyft-e2e/production/state.json`,
    );
    assert.equal(stateExists, true, "state.json should exist after deploy");

    // Verify the state contains our service
    const stateRaw = await box.fs.read(
      `.vyft/${box.id}/vyft-e2e/production/state.json`,
    );
    const state = JSON.parse(stateRaw) as Record<string, unknown>;
    const keys = Object.keys(state);
    assert.equal(keys.length, 1, "should have one entry");
    assert.ok(
      keys[0]?.includes("service:api"),
      `key should contain service:api, got: ${keys[0]}`,
    );

    // Verify Docker container is running
    const psResult = await box.exec(
      'docker ps --filter "label=vyft.managed=true" --filter "name=vyft-vyft-e2e" --format "{{.Names}}"',
    );
    assert.ok(
      psResult.stdout.trim().length > 0,
      "container should be running after deploy",
    );

    // Destroy
    const destroyResult = await box.vyft.raw("destroy");
    assert.equal(
      destroyResult.code,
      0,
      `destroy failed: ${destroyResult.stderr}`,
    );

    // Verify container is gone
    const psAfter = await box.exec(
      'docker ps -a --filter "label=vyft.managed=true" --filter "name=vyft-vyft-e2e" --format "{{.Names}}"',
    );
    assert.equal(
      psAfter.stdout.trim(),
      "",
      "container should be removed after destroy",
    );
  });
});
