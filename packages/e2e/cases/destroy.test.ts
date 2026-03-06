import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sandbox } from "../src/sandbox.ts";

describe("destroy", { concurrency: true }, () => {
  it("removes deployed containers", async () => {
    await using box = await sandbox();
    await box.writeConfig(`
import { service } from "vyft";
export const api = service("api", { image: "nginx:alpine", port: 80 });
`);

    const deploy = await box.vyft.raw("deploy");
    assert.equal(deploy.code, 0, `deploy failed: ${deploy.stderr}`);
    await box.runtime.assertRunning("api");

    const destroy = await box.vyft.raw("destroy");
    assert.equal(destroy.code, 0, `destroy failed: ${destroy.stderr}`);
    await box.runtime.assertNone();
  });

  it("succeeds on empty state", async () => {
    await using box = await sandbox();
    await box.writeConfig("// empty\n");

    const destroy = await box.vyft.raw("destroy");
    assert.equal(destroy.code, 0, `destroy failed: ${destroy.stderr}`);
  });
});
