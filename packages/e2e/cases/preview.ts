import assert from "node:assert";
import { test } from "../src/index.ts";

// =============================================================================
// PREVIEW CREATE OPERATIONS
// =============================================================================

export const previewCreate = test({
  name: "preview shows create for new service",

  config: `
    import { service } from "vyft";

    export const app = service("app", {
      image: "nginx:alpine",
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    const changes = await vyft.preview();

    assert(changes.length > 0, "should have changes");
    const appChange = changes.find((c) => c.resource === "app");
    assert(appChange, "should have app change");
    assert.strictEqual(appChange.action, "create", "should be create action");
  },
});

export const previewCreateMultiple = test({
  name: "preview shows create for multiple services",

  config: `
    import { service } from "vyft";

    export const web = service("web", { image: "nginx:alpine" });
    export const api = service("api", { image: "nginx:alpine" });
    export const worker = service("worker", {
      image: "alpine:latest",
      command: "sleep 3600",
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    const changes = await vyft.preview();

    assert.strictEqual(changes.length, 3, "should have 3 changes");
    assert(
      changes.every((c) => c.action === "create"),
      "all should be create",
    );
  },
});

// =============================================================================
// PREVIEW UPDATE OPERATIONS
// =============================================================================

export const previewUpdateEnv = test({
  name: "preview shows update for env change",

  config: `
    import { service, config } from "vyft";

    export const app = service("app", {
      image: "nginx:alpine",
      env: {
        VERSION: config("version"),
      },
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.config.set("version", "v1.0.0");
    await vyft.deploy();

    await vyft.config.set("version", "v2.0.0");
    const changes = await vyft.preview();

    const appChange = changes.find((c) => c.resource === "app");
    assert(appChange, "should have app change");
    assert.strictEqual(appChange.action, "update", "should be update action");
  },
});

export const previewUpdateImage = test({
  name: "preview shows update for image change",

  run: async ({ id, vyft, writeConfig }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await writeConfig(`
      import { service } from "vyft";
      export const app = service("app", { image: "nginx:1.24" });
    `);
    await vyft.deploy();

    await writeConfig(`
      import { service } from "vyft";
      export const app = service("app", { image: "nginx:1.25" });
    `);

    const changes = await vyft.preview();
    const appChange = changes.find((c) => c.resource === "app");
    assert(appChange, "should have app change");
    assert.strictEqual(appChange.action, "update", "should be update action");
  },
});

export const previewUpdatePort = test({
  name: "preview shows update for port change",

  run: async ({ id, vyft, writeConfig }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await writeConfig(`
      import { service } from "vyft";
      export const app = service("app", { image: "nginx:alpine", port: 80 });
    `);
    await vyft.deploy();

    await writeConfig(`
      import { service } from "vyft";
      export const app = service("app", { image: "nginx:alpine", port: 8080 });
    `);

    const changes = await vyft.preview();
    const appChange = changes.find((c) => c.resource === "app");
    assert(appChange, "should have app change");
  },
});

// =============================================================================
// PREVIEW DELETE OPERATIONS
// =============================================================================

export const previewDelete = test({
  name: "preview shows delete for removed service",

  run: async ({ id, vyft, writeConfig }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await writeConfig(`
      import { service } from "vyft";
      export const app = service("app", { image: "nginx:alpine" });
      export const extra = service("extra", { image: "nginx:alpine" });
    `);
    await vyft.deploy();

    // Remove extra service
    await writeConfig(`
      import { service } from "vyft";
      export const app = service("app", { image: "nginx:alpine" });
    `);

    const changes = await vyft.preview();
    const extraChange = changes.find((c) => c.resource === "extra");
    assert(extraChange, "should have extra change");
    assert.strictEqual(extraChange.action, "delete", "should be delete action");
  },
});

// =============================================================================
// PREVIEW NO CHANGES
// =============================================================================

export const previewNoChanges = test({
  name: "preview shows no changes when up to date",

  config: `
    import { service } from "vyft";

    export const app = service("app", {
      image: "nginx:alpine",
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const changes = await vyft.preview();
    assert.strictEqual(changes.length, 0, "should have no changes");
  },
});

export const previewNoChangesAfterRefresh = test({
  name: "preview shows no changes after refresh",

  config: `
    import { service } from "vyft";

    export const app = service("app", {
      image: "nginx:alpine",
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();
    await vyft.refresh();

    const changes = await vyft.preview();
    assert.strictEqual(changes.length, 0, "should have no changes");
  },
});

// =============================================================================
// PREVIEW MIXED CHANGES
// =============================================================================

export const previewMixedChanges = test({
  name: "preview shows mixed create/update/delete",

  run: async ({ id, vyft, writeConfig }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    // Initial deploy
    await writeConfig(`
      import { service, config } from "vyft";
      export const keep = service("keep", {
        image: "nginx:alpine",
        env: { VERSION: config("version") },
      });
      export const remove = service("remove", { image: "nginx:alpine" });
    `);
    await vyft.config.set("version", "v1");
    await vyft.deploy();

    // Change config: update keep, delete remove, add new
    await writeConfig(`
      import { service, config } from "vyft";
      export const keep = service("keep", {
        image: "nginx:alpine",
        env: { VERSION: config("version") },
      });
      export const add = service("add", { image: "nginx:alpine" });
    `);
    await vyft.config.set("version", "v2");

    const changes = await vyft.preview();

    const keepChange = changes.find((c) => c.resource === "keep");
    const removeChange = changes.find((c) => c.resource === "remove");
    const addChange = changes.find((c) => c.resource === "add");

    assert(keepChange, "should have keep change");
    assert.strictEqual(keepChange.action, "update");

    assert(removeChange, "should have remove change");
    assert.strictEqual(removeChange.action, "delete");

    assert(addChange, "should have add change");
    assert.strictEqual(addChange.action, "create");
  },
});

// =============================================================================
// PREVIEW WITH VOLUMES
// =============================================================================

export const previewCreateVolume = test({
  name: "preview shows create for service with volume",

  config: `
    import { service, volume } from "vyft";

    const data = volume("data");

    export const app = service("app", {
      image: "nginx:alpine",
      mounts: [{ source: data, path: "/data" }],
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    const changes = await vyft.preview();

    assert(changes.length > 0, "should have changes");
  },
});

// =============================================================================
// PREVIEW WITH CRONJOBS
// =============================================================================

export const previewCreateCronjob = test({
  name: "preview shows create for cronjob",

  config: `
    import { cronjob } from "vyft";

    export const task = cronjob("task", {
      schedule: "0 0 * * *",
      image: "alpine:latest",
      command: "echo test",
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    const changes = await vyft.preview();

    const taskChange = changes.find((c) => c.resource === "task");
    assert(taskChange, "should have task change");
    assert.strictEqual(taskChange.action, "create");
  },
});

export const previewUpdateCronjob = test({
  name: "preview shows update for cronjob schedule change",

  run: async ({ id, vyft, writeConfig }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await writeConfig(`
      import { cronjob } from "vyft";
      export const task = cronjob("task", {
        schedule: "0 0 * * *",
        image: "alpine:latest",
        command: "echo test",
      });
    `);
    await vyft.deploy();

    await writeConfig(`
      import { cronjob } from "vyft";
      export const task = cronjob("task", {
        schedule: "0 12 * * *",
        image: "alpine:latest",
        command: "echo test",
      });
    `);

    const changes = await vyft.preview();
    const taskChange = changes.find((c) => c.resource === "task");
    assert(taskChange, "should have task change");
    assert.strictEqual(taskChange.action, "update");
  },
});

// =============================================================================
// PREVIEW WITH DEPENDENCIES
// =============================================================================

export const previewWithDependencies = test({
  name: "preview shows changes for dependent services",

  config: `
    import { service } from "vyft";

    export const db = service("db", {
      image: "alpine:latest",
      command: "sleep 3600",
      health: { command: "true" },
    });

    export const app = service("app", {
      image: "nginx:alpine",
      dependsOn: [db],
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    const changes = await vyft.preview();

    assert.strictEqual(changes.length, 2, "should have 2 changes");
    assert(
      changes.find((c) => c.resource === "db"),
      "should have db",
    );
    assert(
      changes.find((c) => c.resource === "app"),
      "should have app",
    );
  },
});

// =============================================================================
// PREVIEW AFTER DESTROY
// =============================================================================

export const previewAfterDestroy = test({
  name: "preview shows create after destroy",

  config: `
    import { service } from "vyft";

    export const app = service("app", {
      image: "nginx:alpine",
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();
    await vyft.destroy();

    const changes = await vyft.preview();
    const appChange = changes.find((c) => c.resource === "app");
    assert(appChange, "should have app change");
    assert.strictEqual(appChange.action, "create", "should be create action");
  },
});

// =============================================================================
// PREVIEW STAGE ISOLATION
// =============================================================================

export const previewStageIsolation = test({
  name: "preview is isolated per stage",

  config: `
    import { service } from "vyft";

    export const app = service("app", {
      image: "nginx:alpine",
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);

    // Deploy in staging
    await vyft.stage.create("staging");
    await vyft.deploy();

    // Preview in staging should show no changes
    let changes = await vyft.preview();
    assert.strictEqual(changes.length, 0, "staging should have no changes");

    // Preview in production should show create
    await vyft.stage.create("production");
    changes = await vyft.preview();
    assert(
      changes.some((c) => c.action === "create"),
      "production should show create",
    );

    // Clean up
    await vyft.destroy();
    await vyft.stage.use("staging");
    await vyft.destroy();
  },
});
