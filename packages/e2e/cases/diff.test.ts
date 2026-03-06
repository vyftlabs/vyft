import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sandbox } from "../src/sandbox.ts";

const CONFIG = `
import { service } from "vyft";
export const api = service("api", { image: "nginx:alpine", port: 80 });
`;

describe("diff", () => {
  it("shows create for new resources", async () => {
    await using box = await sandbox();
    await box.writeConfig(CONFIG);

    const diff = await box.vyft.raw("diff");
    assert.equal(diff.code, 0, `diff failed: ${diff.stderr}`);
    assert.ok(diff.stdout.includes("+"), `should show create (+), got: ${diff.stdout}`);
    assert.ok(diff.stdout.includes("service:api"), `should mention service:api, got: ${diff.stdout}`);
  });

  it("shows recreate after deploy", async () => {
    await using box = await sandbox();
    await box.writeConfig(CONFIG);

    const deploy = await box.vyft.raw("deploy");
    assert.equal(deploy.code, 0, `deploy failed: ${deploy.stderr}`);

    const diff = await box.vyft.raw("diff");
    assert.equal(diff.code, 0, `diff failed: ${diff.stderr}`);
    assert.ok(diff.stdout.includes("service:api"), `should reference service:api, got: ${diff.stdout}`);
  });

  it("shows delete when resource removed from config", async () => {
    await using box = await sandbox();
    await box.writeConfig(CONFIG);

    const deploy = await box.vyft.raw("deploy");
    assert.equal(deploy.code, 0, `deploy failed: ${deploy.stderr}`);

    await box.writeConfig("// empty config\n");

    const diff = await box.vyft.raw("diff");
    assert.equal(diff.code, 0, `diff failed: ${diff.stderr}`);
    assert.ok(diff.stdout.includes("-"), `should show delete (-), got: ${diff.stdout}`);
  });
});
