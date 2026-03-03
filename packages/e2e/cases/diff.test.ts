import assert from "node:assert";
import { describe, test } from "node:test";
import { sandbox } from "../src/index.ts";

describe("diff", { concurrency: false }, () => {
  // =============================================================================
  // BASIC DIFF
  // =============================================================================

  test("diff shows no drift when matches", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const app = service("app", { image: "nginx:alpine" });
  `,
    );

    await box.vyft.deploy();

    const result = await box.vyft.diff();
    assert.strictEqual(result.hasDrift, false, "should have no drift");
  });

  test("diff detects missing container", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const app = service("app", { image: "nginx:alpine" });
  `,
    );

    await box.vyft.deploy();

    // Remove the container manually - container name includes sandbox id
    await box.exec(
      `docker rm -f $(docker ps -qf name=${box.id}-app) 2>/dev/null || true`,
    );

    const result = await box.vyft.diff();
    assert.strictEqual(result.hasDrift, true, "should detect drift");
  });

  test("diff with multiple services", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const web = service("web", { image: "nginx:alpine" });
    export const api = service("api", { image: "nginx:alpine" });
  `,
    );

    await box.vyft.deploy();

    const result = await box.vyft.diff();
    assert.strictEqual(result.hasDrift, false, "should have no drift");
  });

  // =============================================================================
  // DIFF WITH VOLUMES
  // =============================================================================

  test("diff with volumes", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service, volume } from "vyft";
    const data = volume("data");
    export const app = service("app", {
      image: "nginx:alpine",
      mounts: [{ source: data, path: "/data" }],
    });
  `,
    );

    await box.vyft.deploy();

    const result = await box.vyft.diff();
    assert.strictEqual(result.hasDrift, false, "should have no drift");
  });

  // =============================================================================
  // DIFF WITH CRONJOB
  // =============================================================================

  test("diff with cronjob", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { cronjob } from "vyft";
    export const task = cronjob("task", {
      schedule: "0 0 * * *",
      image: "alpine:latest",
      command: "echo run",
    });
  `,
    );

    await box.vyft.deploy();

    const result = await box.vyft.diff();
    assert.strictEqual(result.hasDrift, false, "should have no drift");
  });

  // =============================================================================
  // DIFF AFTER OPERATIONS
  // =============================================================================

  test("diff after refresh", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const app = service("app", { image: "nginx:alpine" });
  `,
    );

    await box.vyft.deploy();
    await box.vyft.refresh();

    const result = await box.vyft.diff();
    assert.strictEqual(result.hasDrift, false, "should have no drift");
  });

  test("diff after redeploy", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const app = service("app", { image: "nginx:alpine" });
  `,
    );

    await box.vyft.deploy();
    await box.vyft.deploy();

    const result = await box.vyft.diff();
    assert.strictEqual(result.hasDrift, false, "should have no drift");
  });

  // =============================================================================
  // DIFF ERRORS
  // =============================================================================

  test("diff fails with no state", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const app = service("app", { image: "nginx:alpine" });
  `,
    );

    try {
      await box.vyft.diff();
      assert.fail("should have thrown");
    } catch (err) {
      assert(err instanceof Error);
      assert(
        err.message.includes("No state") || err.message.includes("diff failed"),
      );
    }
  });

  // =============================================================================
  // DIFF IDEMPOTENCY
  // =============================================================================

  test("diff is idempotent", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const app = service("app", { image: "nginx:alpine" });
  `,
    );

    await box.vyft.deploy();

    const r1 = await box.vyft.diff();
    const r2 = await box.vyft.diff();
    const r3 = await box.vyft.diff();

    assert.strictEqual(r1.hasDrift, false);
    assert.strictEqual(r2.hasDrift, false);
    assert.strictEqual(r3.hasDrift, false);
  });

  // =============================================================================
  // DIFF WITH CONFIG
  // =============================================================================

  test("diff with config values", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service, config } from "vyft";
    export const app = service("app", {
      image: "nginx:alpine",
      env: { KEY: config("key") },
    });
  `,
    );

    await box.vyft.config.set("key", "value");
    await box.vyft.deploy();

    const result = await box.vyft.diff();
    assert.strictEqual(result.hasDrift, false, "should have no drift");
  });

  test("diff with secrets", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service, config } from "vyft";
    export const app = service("app", {
      image: "nginx:alpine",
      env: { SECRET: config("secret", { secret: true }) },
    });
  `,
    );

    await box.vyft.deploy();

    const result = await box.vyft.diff();
    assert.strictEqual(result.hasDrift, false, "should have no drift");
  });
});
