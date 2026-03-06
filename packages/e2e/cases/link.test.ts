import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sandbox } from "../src/sandbox.ts";

describe("link", { concurrency: true }, () => {
  it("injects linked service env vars", async () => {
    await using box = await sandbox();
    await box.writeConfig(`
import { service } from "vyft";
export const db = service("db", { image: "nginx:alpine", port: 5432 });
export const api = service("api", { image: "nginx:alpine", port: 80, link: [db] });
`);

    const deploy = await box.vyft.raw("deploy");
    assert.equal(deploy.code, 0, `deploy failed: ${deploy.stderr}`);

    await box.runtime.assertRunning("db");
    await box.runtime.assertRunning("api");

    // Inspect the api container to verify linked env vars were injected
    const inspect = await box.exec(
      `docker inspect vyft-${box.project}-production-api --format '{{.Config.Env}}'`,
    );
    const envStr = inspect.stdout.trim();

    assert.ok(envStr.includes("DB_HOST="), `DB_HOST missing in env: ${envStr}`);
    assert.ok(envStr.includes("DB_PORT="), `DB_PORT missing in env: ${envStr}`);
    assert.ok(envStr.includes("DB_URL="), `DB_URL missing in env: ${envStr}`);
  });

  it("resolves linked host and port values", async () => {
    await using box = await sandbox();
    await box.writeConfig(`
import { service } from "vyft";
export const redis = service("redis", { image: "nginx:alpine", port: 6379 });
export const worker = service("worker", { image: "nginx:alpine", port: 80, link: [redis] });
`);

    const deploy = await box.vyft.raw("deploy");
    assert.equal(deploy.code, 0, `deploy failed: ${deploy.stderr}`);

    const inspect = await box.exec(
      `docker inspect vyft-${box.project}-production-worker --format '{{json .Config.Env}}'`,
    );
    const envArr = JSON.parse(inspect.stdout.trim()) as string[];

    const hostVar = envArr.find((e) => e.startsWith("REDIS_HOST="));
    const portVar = envArr.find((e) => e.startsWith("REDIS_PORT="));
    const urlVar = envArr.find((e) => e.startsWith("REDIS_URL="));

    assert.ok(hostVar, `REDIS_HOST missing in env: ${envArr}`);
    assert.ok(portVar, `REDIS_PORT missing in env: ${envArr}`);
    assert.ok(urlVar, `REDIS_URL missing in env: ${envArr}`);

    // Host should be the container name
    assert.ok(
      hostVar.includes(`vyft-${box.project}-production-redis`),
      `REDIS_HOST should be container name, got: ${hostVar}`,
    );
    assert.equal(portVar, "REDIS_PORT=6379");
    assert.ok(
      urlVar.includes("6379"),
      `REDIS_URL should include port, got: ${urlVar}`,
    );
  });
});
