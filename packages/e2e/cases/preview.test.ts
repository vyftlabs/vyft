import assert from "node:assert";
import { describe, test } from "node:test";
import { sandbox } from "../src/index.ts";

describe("preview", { concurrency: false }, () => {
  // =============================================================================
  // CREATE OPERATIONS
  // =============================================================================

  test("preview shows create for new service", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const app = service("app", { image: "nginx:alpine" });
  `,
    );

    const changes = await box.vyft.preview();
    assert(
      changes.some((c) => c.resource === "app" && c.action === "create"),
      "should show create",
    );
  });

  test("preview shows create for multiple services", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const web = service("web", { image: "nginx:alpine" });
    export const api = service("api", { image: "nginx:alpine" });
  `,
    );

    const changes = await box.vyft.preview();
    assert(
      changes.some((c) => c.resource === "web" && c.action === "create"),
      "should show create for web",
    );
    assert(
      changes.some((c) => c.resource === "api" && c.action === "create"),
      "should show create for api",
    );
  });

  // =============================================================================
  // UPDATE OPERATIONS
  // =============================================================================

  test("preview shows update for env change", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const app = service("app", {
      image: "nginx:alpine",
      env: { VERSION: "v1" },
    });
  `,
    );

    await box.vyft.deploy();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const app = service("app", {
      image: "nginx:alpine",
      env: { VERSION: "v2" },
    });
  `,
    );

    const changes = await box.vyft.preview();
    assert(
      changes.some((c) => c.resource === "app" && c.action === "update"),
      "should show update",
    );
  });

  test("preview shows update for image change", async () => {
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
    assert(
      changes.some((c) => c.resource === "app" && c.action === "update"),
      "should show update",
    );
  });

  test("preview shows update for port change", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const app = service("app", { image: "nginx:alpine", port: 3000 });
  `,
    );

    await box.vyft.deploy();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const app = service("app", { image: "nginx:alpine", port: 8080 });
  `,
    );

    const changes = await box.vyft.preview();
    assert(
      changes.some((c) => c.resource === "app" && c.action === "update"),
      "should show update",
    );
  });

  // =============================================================================
  // DELETE OPERATIONS
  // =============================================================================

  test("preview shows delete for removed service", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const app = service("app", { image: "nginx:alpine" });
  `,
    );

    await box.vyft.deploy();

    await box.fs.write("vyft.config.ts", `export default {};`);

    const changes = await box.vyft.preview();
    assert(
      changes.some((c) => c.resource === "app" && c.action === "delete"),
      "should show delete",
    );
  });

  // =============================================================================
  // NO CHANGES
  // =============================================================================

  test("preview shows no changes when up to date", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const app = service("app", { image: "nginx:alpine" });
  `,
    );

    await box.vyft.deploy();

    const changes = await box.vyft.preview();
    assert.strictEqual(changes.length, 0, "should have no changes");
  });

  test("preview shows no changes after refresh", async () => {
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

    const changes = await box.vyft.preview();
    assert.strictEqual(changes.length, 0, "should have no changes");
  });

  // =============================================================================
  // MIXED CHANGES
  // =============================================================================

  test("preview shows mixed create/update/delete", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const keep = service("keep", { image: "nginx:alpine" });
    export const update = service("update", {
      image: "nginx:alpine",
      env: { V: "1" },
    });
    export const remove = service("remove", { image: "nginx:alpine" });
  `,
    );

    await box.vyft.deploy();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const keep = service("keep", { image: "nginx:alpine" });
    export const update = service("update", {
      image: "nginx:alpine",
      env: { V: "2" },
    });
    export const add = service("add", { image: "nginx:alpine" });
  `,
    );

    const changes = await box.vyft.preview();
    assert(
      changes.some((c) => c.resource === "add" && c.action === "create"),
      "should create add",
    );
    assert(
      changes.some((c) => c.resource === "update" && c.action === "update"),
      "should update update",
    );
    assert(
      changes.some((c) => c.resource === "remove" && c.action === "delete"),
      "should delete remove",
    );
  });

  // =============================================================================
  // PREVIEW WITH VOLUMES
  // =============================================================================

  test("preview shows create with volume", async () => {
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

    const changes = await box.vyft.preview();
    assert(changes.length > 0, "should have changes");
  });

  // =============================================================================
  // PREVIEW WITH CRONJOBS
  // =============================================================================

  test("preview shows create for cronjob", async () => {
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

    const changes = await box.vyft.preview();
    assert(
      changes.some((c) => c.resource === "task" && c.action === "create"),
      "should show create for cronjob",
    );
  });

  test("preview shows update for cronjob schedule change", async () => {
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

    await box.fs.write(
      "vyft.config.ts",
      `
    import { cronjob } from "vyft";
    export const task = cronjob("task", {
      schedule: "0 6 * * *",
      image: "alpine:latest",
      command: "echo run",
    });
  `,
    );

    const changes = await box.vyft.preview();
    assert(
      changes.some((c) => c.resource === "task" && c.action === "update"),
      "should show update for schedule change",
    );
  });

  // =============================================================================
  // PREVIEW AFTER DESTROY
  // =============================================================================

  test("preview shows create after destroy", async () => {
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
});
