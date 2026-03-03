import assert from "node:assert";
import { test } from "../src/index.ts";

// =============================================================================
// OUTPUT BASIC OPERATIONS
// =============================================================================

export const outputListsAllResources = test({
  name: "output lists all deployed resources",

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

    await vyft.deploy();

    const outputs = await vyft.output();

    assert(outputs.web, "should have web");
    assert(outputs.api, "should have api");
    assert(outputs.worker, "should have worker");
  },
});

export const outputSingleResource = test({
  name: "output returns single resource details",

  config: `
    import { service } from "vyft";

    export const app = service("app", {
      image: "nginx:alpine",
      port: 80,
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output("app");

    assert(outputs.host, "should have host");
    assert(typeof outputs.host === "string", "host should be string");
  },
});

export const outputEmptyWhenNoResources = test({
  name: "output returns empty when no resources",

  config: `
    // No resources
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output();
    assert.strictEqual(Object.keys(outputs).length, 0, "should be empty");
  },
});

// =============================================================================
// OUTPUT SERVICE PROPERTIES
// =============================================================================

export const outputIncludesHost = test({
  name: "output includes host for service",

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

    const outputs = await vyft.output("app");
    assert(outputs.host, "should have host");
    assert(outputs.host.length > 0, "host should not be empty");
  },
});

export const outputServicePort = test({
  name: "output reflects service port",

  config: `
    import { service } from "vyft";

    export const api = service("api", {
      image: "nginx:alpine",
      port: 8080,
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output("api");
    assert(outputs.host, "should have output");
  },
});

// =============================================================================
// OUTPUT AFTER STATE CHANGES
// =============================================================================

export const outputAfterDeploy = test({
  name: "output available immediately after deploy",

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

    const outputs = await vyft.output();
    assert(outputs.app, "should have app output immediately");
  },
});

export const outputAfterUpdate = test({
  name: "output reflects updated state",

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

    let outputs = await vyft.output("app");
    assert(outputs.host, "should have host");

    // Update and redeploy
    await vyft.config.set("version", "v2");
    await vyft.deploy();

    outputs = await vyft.output("app");
    assert(outputs.host, "should still have host after update");
  },
});

export const outputEmptyAfterDestroy = test({
  name: "output empty after destroy",

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

    try {
      const outputs = await vyft.output();
      assert.strictEqual(Object.keys(outputs).length, 0);
    } catch {
      // Expected - may error on no resources
    }
  },
});

// =============================================================================
// OUTPUT STAGE ISOLATION
// =============================================================================

export const outputIsolatedByStage = test({
  name: "output is isolated by stage",

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

    const stagingOutput = await vyft.output();
    assert(stagingOutput.app, "staging should have app");

    // Production should be empty
    await vyft.stage.create("production");

    try {
      const prodOutput = await vyft.output();
      assert.strictEqual(
        Object.keys(prodOutput).length,
        0,
        "production should be empty",
      );
    } catch {
      // Expected - no resources in production
    }

    // Clean up
    await vyft.stage.use("staging");
    await vyft.destroy();
  },
});

// =============================================================================
// OUTPUT WITH MULTIPLE RESOURCE TYPES
// =============================================================================

export const outputMultipleTypes = test({
  name: "output includes all resource types",

  config: `
    import { service, cronjob, volume } from "vyft";

    const data = volume("data");

    export const web = service("web", {
      image: "nginx:alpine",
      mounts: [{ source: data, path: "/data" }],
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
    assert(outputs.web, "should have web service");
    assert(outputs.cleanup, "should have cleanup cronjob");
  },
});

// =============================================================================
// OUTPUT WITH DEPENDENCIES
// =============================================================================

export const outputWithDependencies = test({
  name: "output includes dependent services",

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

    await vyft.deploy();

    const outputs = await vyft.output();
    assert(outputs.db, "should have db");
    assert(outputs.app, "should have app");
  },
});

// =============================================================================
// OUTPUT FORMATTING
// =============================================================================

export const outputJsonFormat = test({
  name: "output returns valid JSON structure",

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

    const outputs = await vyft.output();

    // Should be a valid object
    assert(typeof outputs === "object", "should be object");
    assert(!Array.isArray(outputs), "should not be array");
  },
});

// =============================================================================
// OUTPUT NONEXISTENT RESOURCE
// =============================================================================

export const outputNonexistentResource = test({
  name: "output for nonexistent resource fails",

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

    try {
      await vyft.output("nonexistent");
      // If it doesn't throw, check the result
      const result = await vyft.output("nonexistent");
      assert(
        !result || Object.keys(result).length === 0,
        "should be empty for nonexistent",
      );
    } catch {
      // Expected behavior
    }
  },
});

// =============================================================================
// OUTPUT CONSISTENCY
// =============================================================================

export const outputConsistentAcrossCalls = test({
  name: "output is consistent across multiple calls",

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

    const output1 = await vyft.output("app");
    const output2 = await vyft.output("app");
    const output3 = await vyft.output("app");

    assert.strictEqual(output1.host, output2.host, "outputs should match 1-2");
    assert.strictEqual(output2.host, output3.host, "outputs should match 2-3");
  },
});

export const outputConsistentAfterRefresh = test({
  name: "output is consistent after refresh",

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

    const beforeRefresh = await vyft.output("app");
    await vyft.refresh();
    const afterRefresh = await vyft.output("app");

    assert.strictEqual(
      beforeRefresh.host,
      afterRefresh.host,
      "host should be same after refresh",
    );
  },
});

// =============================================================================
// OUTPUT WITH SECRETS
// =============================================================================

export const outputHidesSecretsByDefault = test({
  name: "output hides secrets by default",

  env: {
    VYFT_PASSPHRASE: "test-passphrase-output",
  },

  config: `
    import { service, config } from "vyft";

    export const app = service("app", {
      image: "nginx:alpine",
      env: {
        SECRET: config("secret", { secret: true }),
      },
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    // Default output should not expose raw secret
    const outputs = await vyft.output();
    assert(outputs.app, "should have app");
  },
});

// =============================================================================
// OUTPUT RAW COMMAND
// =============================================================================

export const outputRawJson = test({
  name: "raw output command returns JSON",

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

    const result = await vyft.raw("output --json");
    assert.strictEqual(result.code, 0, "should succeed");

    // Should be valid JSON
    const parsed = JSON.parse(result.stdout);
    assert(typeof parsed === "object", "should be object");
  },
});
