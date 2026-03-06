import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sandbox } from "../src/sandbox.ts";

const CONFIG = `
import { service } from "vyft";
export const api = service("api", { image: "nginx:alpine", port: 80 });
`;

describe("deploy", () => {
  it("creates a service container", async () => {
    await using box = await sandbox();
    await box.writeConfig(CONFIG);

    const deploy = await box.vyft.raw("deploy");
    assert.equal(deploy.code, 0, `deploy failed: ${deploy.stderr}`);

    await box.runtime.assertRunning("api");
  });

  it("recreates container on config change", async () => {
    await using box = await sandbox();
    await box.writeConfig(CONFIG);

    const first = await box.vyft.raw("deploy");
    assert.equal(first.code, 0, `first deploy failed: ${first.stderr}`);

    const id1 = await box.runtime.getId("api");

    await box.writeConfig(`
import { service } from "vyft";
export const api = service("api", { image: "nginx:alpine", port: 80, env: { FOO: "bar" } });
`);

    const second = await box.vyft.raw("deploy");
    assert.equal(second.code, 0, `second deploy failed: ${second.stderr}`);

    const id2 = await box.runtime.getId("api");
    assert.notEqual(id1, id2, "container should have been recreated");
  });

  it("deploys multiple services", async () => {
    await using box = await sandbox();
    await box.writeConfig(`
import { service } from "vyft";
export const web = service("web", { image: "nginx:alpine", port: 80 });
export const api = service("api", { image: "nginx:alpine", port: 80 });
`);

    const deploy = await box.vyft.raw("deploy");
    assert.equal(deploy.code, 0, `deploy failed: ${deploy.stderr}`);

    const names = await box.runtime.list();
    assert.equal(names.length, 2, `expected 2 containers, got: ${names}`);
    assert.ok(
      names.some((n) => n.includes("web")),
      "web container missing",
    );
    assert.ok(
      names.some((n) => n.includes("api")),
      "api container missing",
    );
  });
});
