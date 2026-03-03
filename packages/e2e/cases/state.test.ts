import assert from "node:assert";
import { describe, test } from "node:test";
import { sandbox } from "../src/index.ts";

describe("state", { concurrency: false }, () => {
  // =============================================================================
  // STATE PERSISTENCE
  // =============================================================================

  test("state persists across commands", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const app = service("app", { image: "nginx:alpine" });
  `,
    );

    await box.vyft.deploy();

    // Multiple output calls should see same state
    const o1 = await box.vyft.output();
    const o2 = await box.vyft.output();
    const o3 = await box.vyft.output();

    assert(o1.app, "first output");
    assert(o2.app, "second output");
    assert(o3.app, "third output");
  });

  test("state persists after refresh", async () => {
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

    const outputs = await box.vyft.output();
    assert(outputs.app, "should have app after refresh");
  });

  // =============================================================================
  // REFRESH OPERATIONS
  // =============================================================================

  test("refresh syncs state with infrastructure", async () => {
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

    const outputs = await box.vyft.output();
    assert(outputs.app, "should have app");
  });

  test("refresh clear-pending clears operations", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const app = service("app", { image: "nginx:alpine" });
  `,
    );

    await box.vyft.deploy();
    await box.vyft.refresh({ clearPending: true });

    const outputs = await box.vyft.output();
    assert(outputs.app, "should have app after clear-pending");
  });

  // =============================================================================
  // STATE UPDATES
  // =============================================================================

  test("state updates on deploy", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service, config } from "vyft";
    export const app = service("app", {
      image: "nginx:alpine",
      env: { VERSION: config("version") },
    });
  `,
    );

    await box.vyft.config.set("version", "v1");
    await box.vyft.deploy();

    await box.vyft.config.set("version", "v2");
    await box.vyft.deploy();

    const changes = await box.vyft.preview();
    assert.strictEqual(changes.length, 0, "no pending changes");
  });

  test("state clears on destroy", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const app = service("app", { image: "nginx:alpine" });
  `,
    );

    await box.vyft.deploy();
    await box.vyft.destroy();

    const changes = await box.vyft.preview();
    assert(
      changes.some((c) => c.action === "create"),
      "should show create after destroy",
    );
  });

  // =============================================================================
  // STATE WITH MULTIPLE RESOURCES
  // =============================================================================

  test("state tracks multiple resources", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service, volume, cronjob } from "vyft";
    const data = volume("data");
    export const web = service("web", {
      image: "nginx:alpine",
      mounts: [{ source: data, path: "/data" }],
    });
    export const api = service("api", { image: "nginx:alpine" });
    export const cleanup = cronjob("cleanup", {
      schedule: "0 0 * * *",
      image: "alpine:latest",
      command: "echo cleanup",
    });
  `,
    );

    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.web, "should have web");
    assert(outputs.api, "should have api");
    assert(outputs.cleanup, "should have cleanup");

    const changes = await box.vyft.preview();
    assert.strictEqual(changes.length, 0, "no pending changes");
  });

  // =============================================================================
  // FINGERPRINTING
  // =============================================================================

  test("detects config changes via fingerprint", async () => {
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

    await box.vyft.config.set("key", "value1");
    await box.vyft.deploy();

    let changes = await box.vyft.preview();
    assert.strictEqual(changes.length, 0, "no changes initially");

    await box.vyft.config.set("key", "value2");
    await box.vyft.deploy();

    changes = await box.vyft.preview();
    assert.strictEqual(changes.length, 0, "no changes after update");
  });

  test("detects image changes", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const app = service("app", { image: "nginx:1.24" });
  `,
    );

    await box.vyft.deploy();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const app = service("app", { image: "nginx:1.25" });
  `,
    );

    const changes = await box.vyft.preview();
    assert(changes.length > 0, "should detect image change");
  });

  // =============================================================================
  // IDEMPOTENCY
  // =============================================================================

  test("deploy is idempotent", async () => {
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
    await box.vyft.deploy();

    const changes = await box.vyft.preview();
    assert.strictEqual(changes.length, 0, "no changes");
  });

  test("refresh is idempotent", async () => {
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
    await box.vyft.refresh();
    await box.vyft.refresh();

    const changes = await box.vyft.preview();
    assert.strictEqual(changes.length, 0, "no changes");
  });

  // =============================================================================
  // VERBOSE FLAGS
  // =============================================================================

  test("deploy with verbose", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const app = service("app", { image: "nginx:alpine" });
  `,
    );

    await box.vyft.deploy({ verbose: true });

    const outputs = await box.vyft.output();
    assert(outputs.app, "should deploy with verbose");
  });

  test("destroy with verbose", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const app = service("app", { image: "nginx:alpine" });
  `,
    );

    await box.vyft.deploy();
    await box.vyft.destroy({ verbose: true });

    const changes = await box.vyft.preview();
    assert(changes.some((c) => c.action === "create"));
  });

  // =============================================================================
  // DEPLOY WITH REFRESH
  // =============================================================================

  test("deploy with refresh flag", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const app = service("app", { image: "nginx:alpine" });
  `,
    );

    await box.vyft.deploy({ refresh: true });

    const outputs = await box.vyft.output();
    assert(outputs.app, "should deploy with refresh");
  });

  test("deploy refresh after initial deploy", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const app = service("app", { image: "nginx:alpine" });
  `,
    );

    await box.vyft.deploy();
    await box.vyft.deploy({ refresh: true });

    const changes = await box.vyft.preview();
    assert.strictEqual(changes.length, 0, "no changes after refresh deploy");
  });
});
