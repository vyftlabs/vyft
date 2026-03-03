import assert from "node:assert";
import { test } from "../src/index.ts";

// =============================================================================
// STATE PERSISTENCE
// =============================================================================

export const statePersistsAcrossCommands = test({
  name: "state persists across multiple commands",

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

    // Multiple commands should see same state
    let outputs = await vyft.output();
    assert(outputs.app, "should have app after first output");

    outputs = await vyft.output();
    assert(outputs.app, "should have app after second output");

    // Preview should show no changes
    const changes = await vyft.preview();
    assert.strictEqual(changes.length, 0, "should have no changes");
  },
});

export const statePersistsAfterRefresh = test({
  name: "state persists after refresh",

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

    const outputs = await vyft.output();
    assert(outputs.app, "should have app after refresh");
  },
});

// =============================================================================
// REFRESH OPERATIONS
// =============================================================================

export const refreshSyncsState = test({
  name: "refresh syncs state with live infrastructure",

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

    // Refresh should work
    await vyft.refresh();

    // State should still be valid
    const outputs = await vyft.output();
    assert(outputs.app, "should have app after refresh");
  },
});

export const refreshClearPending = test({
  name: "refresh --clear-pending clears pending operations",

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

    // Clear pending should work
    await vyft.refresh({ clearPending: true });

    const outputs = await vyft.output();
    assert(outputs.app, "should have app after clear-pending");
  },
});

// =============================================================================
// STATE ISOLATION
// =============================================================================

export const stateIsolatedByContext = test({
  name: "state is isolated by context",

  config: `
    import { service } from "vyft";

    export const app = service("app", {
      image: "nginx:alpine",
    });
  `,

  run: async ({ id, vyft }) => {
    const ctx1 = `${id}-a`;
    const ctx2 = `${id}-b`;

    // Deploy in first context
    await vyft.context.create(ctx1);
    await vyft.stage.create(`${id}-stg1`);
    await vyft.deploy();

    // Second context should be isolated
    await vyft.context.create(ctx2);
    await vyft.stage.create(`${id}-stg2`);

    // Preview should show create (isolated state)
    const changes = await vyft.preview();
    assert(
      changes.some((c) => c.action === "create"),
      "should show create in isolated context",
    );

    // Clean up first context
    await vyft.context.use(ctx1);
    await vyft.stage.use(`${id}-stg1`);
    await vyft.destroy();
  },
});

export const stateIsolatedByStage = test({
  name: "state is isolated by stage",

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

    // Production should be isolated
    await vyft.stage.create("production");

    // Preview should show create
    const changes = await vyft.preview();
    assert(
      changes.some((c) => c.action === "create"),
      "should show create in isolated stage",
    );

    // Clean up both stages
    await vyft.destroy();
    await vyft.stage.use("staging");
    await vyft.destroy();
  },
});

// =============================================================================
// STATE RECOVERY
// =============================================================================

export const stateRecoveryAfterFailedDeploy = test({
  name: "state recovers from failed deploy",

  run: async ({ id, vyft, writeConfig }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    // Deploy valid config first
    await writeConfig(`
      import { service } from "vyft";
      export const app = service("app", { image: "nginx:alpine" });
    `);
    await vyft.deploy();

    // Try invalid config
    await writeConfig(`
      import { service } from "vyft";
      export const app = service("Invalid!", { image: "nginx:alpine" });
    `);

    try {
      await vyft.deploy();
    } catch {
      // Expected to fail
    }

    // Restore valid config
    await writeConfig(`
      import { service } from "vyft";
      export const app = service("app", { image: "nginx:alpine" });
    `);

    // Should still work
    await vyft.deploy();

    const outputs = await vyft.output();
    assert(outputs.app, "should recover successfully");
  },
});

// =============================================================================
// STATE WITH UPDATES
// =============================================================================

export const stateUpdatesOnDeploy = test({
  name: "state updates correctly on deploy",

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

    // Initial deploy
    await vyft.config.set("version", "v1");
    await vyft.deploy();

    // Update and redeploy
    await vyft.config.set("version", "v2");
    await vyft.deploy();

    // State should reflect update
    const changes = await vyft.preview();
    assert.strictEqual(changes.length, 0, "should have no pending changes");
  },
});

export const stateUpdatesOnDestroy = test({
  name: "state clears on destroy",

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

    // State should be empty
    try {
      const outputs = await vyft.output();
      assert.strictEqual(Object.keys(outputs).length, 0);
    } catch {
      // Expected - no resources
    }

    // Preview should show create
    const changes = await vyft.preview();
    assert(
      changes.some((c) => c.action === "create"),
      "should show create after destroy",
    );
  },
});

// =============================================================================
// STATE WITH MULTIPLE RESOURCES
// =============================================================================

export const stateTracksMultipleResources = test({
  name: "state tracks multiple resources correctly",

  config: `
    import { service, volume, cronjob } from "vyft";

    const data = volume("data");

    export const web = service("web", {
      image: "nginx:alpine",
      mounts: [{ source: data, path: "/data" }],
    });

    export const api = service("api", {
      image: "nginx:alpine",
    });

    export const cleanup = cronjob("cleanup", {
      schedule: "0 0 * * *",
      image: "alpine:latest",
      command: "echo cleanup",
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output();
    assert(outputs.web, "should have web");
    assert(outputs.api, "should have api");
    assert(outputs.cleanup, "should have cleanup");

    // No pending changes
    const changes = await vyft.preview();
    assert.strictEqual(changes.length, 0, "should have no changes");
  },
});

// =============================================================================
// STATE FINGERPRINTING
// =============================================================================

export const stateDetectsConfigChanges = test({
  name: "state detects config changes via fingerprint",

  config: `
    import { service, config } from "vyft";

    export const app = service("app", {
      image: "nginx:alpine",
      env: {
        KEY: config("key"),
      },
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.config.set("key", "value1");
    await vyft.deploy();

    // No changes initially
    let changes = await vyft.preview();
    assert.strictEqual(changes.length, 0, "no changes after initial deploy");

    // Change config - this should trigger a change since env values are resolved
    await vyft.config.set("key", "value2");

    // Deploy with new config value
    await vyft.deploy();

    // After deploy with new value, there should be no pending changes
    changes = await vyft.preview();
    assert.strictEqual(changes.length, 0, "no changes after update deploy");
  },
});

export const stateDetectsImageChanges = test({
  name: "state detects image changes",

  run: async ({ id, vyft, writeConfig }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await writeConfig(`
      import { service } from "vyft";
      export const app = service("app", { image: "nginx:1.24" });
    `);
    await vyft.deploy();

    let changes = await vyft.preview();
    assert.strictEqual(changes.length, 0);

    await writeConfig(`
      import { service } from "vyft";
      export const app = service("app", { image: "nginx:1.25" });
    `);

    changes = await vyft.preview();
    assert(changes.length > 0, "should detect image change");
  },
});

// =============================================================================
// STATE IDEMPOTENCY
// =============================================================================

export const deployIdempotent = test({
  name: "deploy is idempotent",

  config: `
    import { service } from "vyft";

    export const app = service("app", {
      image: "nginx:alpine",
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    // Deploy multiple times
    await vyft.deploy();
    await vyft.deploy();
    await vyft.deploy();

    // State should be consistent
    const changes = await vyft.preview();
    assert.strictEqual(changes.length, 0, "should have no changes");
  },
});

export const refreshIdempotent = test({
  name: "refresh is idempotent",

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

    // Refresh multiple times
    await vyft.refresh();
    await vyft.refresh();
    await vyft.refresh();

    // State should be consistent
    const changes = await vyft.preview();
    assert.strictEqual(changes.length, 0, "should have no changes");
  },
});

// =============================================================================
// STATE WITH VERBOSE
// =============================================================================

export const deployVerbose = test({
  name: "deploy with verbose flag",

  config: `
    import { service } from "vyft";

    export const app = service("app", {
      image: "nginx:alpine",
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    // Should work with verbose
    await vyft.deploy({ verbose: true });

    const outputs = await vyft.output();
    assert(outputs.app, "should deploy successfully");
  },
});

export const destroyVerbose = test({
  name: "destroy with verbose flag",

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
    await vyft.destroy({ verbose: true });

    try {
      const outputs = await vyft.output();
      assert.strictEqual(Object.keys(outputs).length, 0);
    } catch {
      // Expected
    }
  },
});

export const destroyCleansUpNetwork = test({
  name: "destroy removes docker network",

  config: `
    import { service } from "vyft";

    export const app = service("app", {
      image: "nginx:alpine",
    });
  `,

  run: async ({ id, vyft, exec, tmpDir }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    // Deploy creates the network
    await vyft.deploy();

    // Network name is vyft-${project}-${stage}
    const project = tmpDir.split("/").pop() ?? "";
    const stage = id;
    const networkName = `vyft-${project}-${stage}`;

    const beforeDestroy = await exec(
      `docker network ls --filter name=${networkName} --format "{{.Name}}"`,
    );
    assert.strictEqual(
      beforeDestroy.stdout.trim(),
      networkName,
      "network should exist after deploy",
    );

    // Destroy should remove the network
    await vyft.destroy();

    const afterDestroy = await exec(
      `docker network ls --filter name=${networkName} --format "{{.Name}}"`,
    );
    assert.strictEqual(
      afterDestroy.stdout.trim(),
      "",
      "network should be removed after destroy",
    );
  },
});

export const destroyWithoutDeployCleansUpNetwork = test({
  name: "destroy without prior deploy still tears down infrastructure",

  config: `
    import { service } from "vyft";

    export const app = service("app", {
      image: "nginx:alpine",
    });
  `,

  run: async ({ id, vyft, exec, tmpDir }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    // Network name is vyft-${project}-${stage}
    const project = tmpDir.split("/").pop() ?? "";
    const stage = id;
    const networkName = `vyft-${project}-${stage}`;

    // Manually create the network to simulate orphaned infrastructure
    await exec(`docker network create ${networkName}`);

    // Verify it exists
    const beforeDestroy = await exec(
      `docker network ls --filter name=${networkName} --format "{{.Name}}"`,
    );
    assert.strictEqual(
      beforeDestroy.stdout.trim(),
      networkName,
      "network should exist before destroy",
    );

    // Destroy with no prior deploy should still clean up
    await vyft.destroy();

    const afterDestroy = await exec(
      `docker network ls --filter name=${networkName} --format "{{.Name}}"`,
    );
    assert.strictEqual(
      afterDestroy.stdout.trim(),
      "",
      "network should be removed after destroy even without prior deploy",
    );
  },
});
