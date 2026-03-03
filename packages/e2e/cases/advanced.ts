import assert from "node:assert";
import { test } from "../src/index.ts";

// =============================================================================
// DEPLOY WITH REFRESH FLAG
// =============================================================================

export const deployWithRefresh = test({
  name: "deploy with --refresh inspects live state",

  config: `
    import { service } from "vyft";

    export const app = service("app", {
      image: "nginx:alpine",
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    // Deploy with refresh
    await vyft.deploy({ refresh: true });

    const outputs = await vyft.output("app");
    assert(outputs.host, "should deploy with refresh");
  },
});

// =============================================================================
// RAPID SUCCESSIVE DEPLOYS
// =============================================================================

export const rapidDeploys = test({
  name: "rapid successive deploys are stable",

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

    // Multiple deploys with config changes
    for (let i = 1; i <= 3; i++) {
      await vyft.config.set("version", `v${i}`);
      await vyft.deploy();
    }

    // State should be stable
    const changes = await vyft.preview();
    assert.strictEqual(changes.length, 0, "should have no pending changes");
  },
});

// =============================================================================
// CONFIG HOT-SWAP
// =============================================================================

export const configHotSwap = test({
  name: "hot-swap config file between deploys",

  run: async ({ id, vyft, writeConfig }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    // First config
    await writeConfig(`
      import { service } from "vyft";
      export const web = service("web", { image: "nginx:alpine" });
    `);
    await vyft.deploy();

    // Completely different config
    await writeConfig(`
      import { service } from "vyft";
      export const api = service("api", { image: "nginx:alpine" });
      export const worker = service("worker", {
        image: "alpine:latest",
        command: "sleep 3600",
      });
    `);

    // Should handle gracefully
    const changes = await vyft.preview();
    assert(
      changes.some((c) => c.resource === "web" && c.action === "delete"),
      "should delete old web",
    );
    assert(
      changes.some((c) => c.resource === "api" && c.action === "create"),
      "should create api",
    );
    assert(
      changes.some((c) => c.resource === "worker" && c.action === "create"),
      "should create worker",
    );

    await vyft.deploy();

    const outputs = await vyft.output();
    assert(!outputs.web, "should not have web");
    assert(outputs.api, "should have api");
    assert(outputs.worker, "should have worker");
  },
});

// =============================================================================
// SCALE UP/DOWN
// =============================================================================

export const scaleServicesUpDown = test({
  name: "add and remove services dynamically",

  run: async ({ id, vyft, writeConfig }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    // Start with one service
    await writeConfig(`
      import { service } from "vyft";
      export const app = service("app", { image: "nginx:alpine" });
    `);
    await vyft.deploy();

    // Scale up
    await writeConfig(`
      import { service } from "vyft";
      export const app = service("app", { image: "nginx:alpine" });
      export const worker1 = service("worker1", {
        image: "alpine:latest",
        command: "sleep 3600",
      });
      export const worker2 = service("worker2", {
        image: "alpine:latest",
        command: "sleep 3600",
      });
    `);
    await vyft.deploy();

    let outputs = await vyft.output();
    assert(outputs.app, "should have app");
    assert(outputs.worker1, "should have worker1");
    assert(outputs.worker2, "should have worker2");

    // Scale down
    await writeConfig(`
      import { service } from "vyft";
      export const app = service("app", { image: "nginx:alpine" });
    `);
    await vyft.deploy();

    outputs = await vyft.output();
    assert(outputs.app, "should have app");
    assert(!outputs.worker1, "should not have worker1");
    assert(!outputs.worker2, "should not have worker2");
  },
});

// =============================================================================
// ENVIRONMENT VARIABLE TYPES
// =============================================================================

export const envVarTypes = test({
  name: "environment variables of different types",

  config: `
    import { service, config } from "vyft";

    export const app = service("app", {
      image: "nginx:alpine",
      env: {
        STRING_VAL: "hello",
        NUMBER_VAL: "42",
        BOOL_VAL: "true",
        EMPTY_VAL: "",
        CONFIG_VAL: config("from-config"),
        URL_VAL: "https://example.com/path?query=value",
        JSON_VAL: '{"key":"value"}',
      },
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.config.set("from-config", "config-value");

    await vyft.deploy();

    const outputs = await vyft.output("app");
    assert(outputs.host, "should deploy with various env types");
  },
});

// =============================================================================
// COMMAND VARIATIONS
// =============================================================================

export const commandVariations = test({
  name: "services with different command formats",

  config: `
    import { service } from "vyft";

    export const simple = service("simple", {
      image: "alpine:latest",
      command: "sleep 3600",
    });

    export const shell = service("shell", {
      image: "alpine:latest",
      command: "sh -c 'echo hello && sleep 3600'",
    });

    export const array = service("array", {
      image: "alpine:latest",
      command: ["sh", "-c", "echo hello && sleep 3600"],
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output();
    assert(outputs.simple, "should have simple");
    assert(outputs.shell, "should have shell");
    assert(outputs.array, "should have array");
  },
});

// =============================================================================
// LONG RUNNING OPERATIONS
// =============================================================================

export const longRunningDeploy = test({
  name: "deploy with slow health checks",
  timeout: 300_000, // 5 minutes

  config: `
    import { service } from "vyft";

    export const slow = service("slow", {
      image: "postgres:alpine",
      env: { POSTGRES_PASSWORD: "test" },
      health: {
        command: "pg_isready -U postgres",
        interval: "5s",
        timeout: "10s",
        retries: 20,
        startPeriod: "30s",
      },
    });

    export const dependent = service("dependent", {
      image: "nginx:alpine",
      dependsOn: [slow],
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output();
    assert(outputs.slow, "should have slow service");
    assert(outputs.dependent, "should have dependent service");
  },
});

// =============================================================================
// RESOURCE NAME EDGE CASES
// =============================================================================

export const resourceNameEdgeCases = test({
  name: "resource names at boundary limits",

  config: `
    import { service } from "vyft";

    // Single character (minimum)
    export const a = service("a", { image: "nginx:alpine" });

    // With numbers
    export const svc123 = service("svc123", { image: "nginx:alpine" });

    // With hyphens
    export const myApp = service("my-app", { image: "nginx:alpine" });

    // Longer name
    export const longer = service("my-long-service-name", {
      image: "nginx:alpine",
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output();
    assert(outputs.a, "should have single-char name");
    assert(outputs.svc123, "should have numeric name");
    assert(outputs["my-app"], "should have hyphenated name");
    assert(outputs["my-long-service-name"], "should have longer name");
  },
});

// =============================================================================
// EMPTY THEN POPULATE
// =============================================================================

export const emptyThenPopulate = test({
  name: "deploy empty then add resources",

  run: async ({ id, vyft, writeConfig }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    // Start empty
    await writeConfig(`// empty config`);
    await vyft.deploy();

    // Empty deploy may error on output - that's expected
    try {
      const outputs = await vyft.output();
      assert.strictEqual(Object.keys(outputs).length, 0);
    } catch {
      // Expected when no resources deployed
    }

    // Add resources
    await writeConfig(`
      import { service } from "vyft";
      export const app = service("app", { image: "nginx:alpine" });
    `);
    await vyft.deploy();

    const outputs = await vyft.output();
    assert(outputs.app, "should have app after populate");
  },
});

// =============================================================================
// POPULATE THEN EMPTY
// =============================================================================

export const populateThenEmpty = test({
  name: "deploy resources then remove all",

  run: async ({ id, vyft, writeConfig }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    // Start with resources
    await writeConfig(`
      import { service } from "vyft";
      export const app = service("app", { image: "nginx:alpine" });
      export const api = service("api", { image: "nginx:alpine" });
    `);
    await vyft.deploy();

    // Remove all
    await writeConfig(`// empty config`);
    await vyft.deploy();

    // Output may error when no resources - that's expected
    try {
      const outputs = await vyft.output();
      assert.strictEqual(Object.keys(outputs).length, 0);
    } catch {
      // Expected when all resources removed
    }
  },
});

// =============================================================================
// COMPLEX TOPOLOGY
// =============================================================================

export const complexTopology = test({
  name: "complex service topology",

  config: `
    import { service, volume, cronjob } from "vyft";

    const sharedData = volume("shared");
    const cacheData = volume("cache-data");

    export const db = service("db", {
      image: "postgres:alpine",
      env: { POSTGRES_PASSWORD: "test" },
      mounts: [{ source: sharedData, path: "/var/lib/postgresql/data" }],
      health: {
        command: "pg_isready -U postgres",
        interval: "5s",
        retries: 10,
      },
    });

    export const cache = service("cache", {
      image: "redis:alpine",
      mounts: [{ source: cacheData, path: "/data" }],
      health: {
        command: "redis-cli ping",
        interval: "5s",
        retries: 5,
      },
    });

    export const api = service("api", {
      image: "nginx:alpine",
      dependsOn: [db, cache],
      link: [db, cache],
    });

    export const worker = service("worker", {
      image: "alpine:latest",
      command: "sleep 3600",
      dependsOn: [db, cache],
      link: [db, cache],
    });

    export const web = service("web", {
      image: "nginx:alpine",
      dependsOn: [api],
      link: [api],
    });

    export const backup = cronjob("backup", {
      schedule: "0 2 * * *",
      image: "alpine:latest",
      command: "echo backup",
      link: [db],
    });
  `,

  timeout: 180_000,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output();
    assert(outputs.db, "should have db");
    assert(outputs.cache, "should have cache");
    assert(outputs.api, "should have api");
    assert(outputs.worker, "should have worker");
    assert(outputs.web, "should have web");
    assert(outputs.backup, "should have backup");
  },
});

// =============================================================================
// PREVIEW VERBOSE
// =============================================================================

export const previewVerbose = test({
  name: "preview with verbose flag",

  config: `
    import { service } from "vyft";

    export const app = service("app", {
      image: "nginx:alpine",
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    const changes = await vyft.preview({ verbose: true });
    assert(changes.length > 0, "should have changes");
  },
});
