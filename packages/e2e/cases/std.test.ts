import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sandbox } from "../src/sandbox.ts";

describe("std", { concurrency: true }, () => {
  it("deploys file resource and reads content", async () => {
    await using box = await sandbox();

    await box.fs.write("hello.txt", "hello from vyft");

    await box.writeConfig(`
import { std } from "vyft";
export const readme = std.fs.file("readme", { source: "./hello.txt" });
`);

    const deploy = await box.vyft.raw("deploy");
    assert.equal(deploy.code, 0, `deploy failed: ${deploy.stderr}`);
  });

  it("deploys template resource with variables", async () => {
    await using box = await sandbox();

    await box.fs.write("greeting.tpl", "Hello, {{name}}! Port: {{port}}");

    await box.writeConfig(`
import { std } from "vyft";
export const greeting = std.fs.template("greeting", {
  source: "./greeting.tpl",
  vars: { name: "vyft", port: "8080" },
});
`);

    const deploy = await box.vyft.raw("deploy");
    assert.equal(deploy.code, 0, `deploy failed: ${deploy.stderr}`);
  });

  it("deploys crypto resources", async () => {
    await using box = await sandbox();

    await box.writeConfig(`
import { std } from "vyft";
export const uuid = std.crypto.randomUuid("uuid", {});
export const secret = std.crypto.randomString("secret", { length: 32 });
export const key = std.crypto.sshKeyPair("key", { type: "ed25519" });
`);

    const deploy = await box.vyft.raw("deploy");
    assert.equal(deploy.code, 0, `deploy failed: ${deploy.stderr}`);
  });

  it("shows diff for new std resources", async () => {
    await using box = await sandbox();

    await box.fs.write("data.txt", "some data");

    await box.writeConfig(`
import { std } from "vyft";
export const data = std.fs.file("data", { source: "./data.txt" });
export const id = std.crypto.randomUuid("id", {});
`);

    const diff = await box.vyft.raw("diff");
    assert.equal(diff.code, 0, `diff failed: ${diff.stderr}`);
    assert.ok(
      diff.stdout.includes("+"),
      `should show create (+), got: ${diff.stdout}`,
    );
  });

  it("destroys std resources", async () => {
    await using box = await sandbox();

    await box.writeConfig(`
import { std } from "vyft";
export const token = std.crypto.randomBytes("token", { length: 16 });
`);

    const deploy = await box.vyft.raw("deploy");
    assert.equal(deploy.code, 0, `deploy failed: ${deploy.stderr}`);

    const destroy = await box.vyft.raw("destroy -y");
    assert.equal(destroy.code, 0, `destroy failed: ${destroy.stderr}`);
  });
});
