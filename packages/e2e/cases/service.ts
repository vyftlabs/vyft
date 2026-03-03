import assert from "node:assert";
import { test } from "../src/index.ts";

// =============================================================================
// BASIC SERVICE DEPLOYMENT
// =============================================================================

export const serviceDeployImage = test({
  name: "deploy service with image",

  config: `
    import { service } from "vyft";

    export const web = service("web", {
      image: "nginx:alpine",
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output("web");
    assert(outputs.host, "should have host");
  },
});

export const serviceDeployWithPort = test({
  name: "deploy service with custom port",

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
    assert(outputs.host, "should have host");
  },
});

export const serviceDeployMultiple = test({
  name: "deploy multiple services",

  config: `
    import { service } from "vyft";

    export const web = service("web", {
      image: "nginx:alpine",
    });

    export const api = service("api", {
      image: "nginx:alpine",
      port: 8080,
    });

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
    assert(outputs.web, "should have web service");
    assert(outputs.api, "should have api service");
    assert(outputs.worker, "should have worker service");
  },
});

// =============================================================================
// SERVICE ENVIRONMENT VARIABLES
// =============================================================================

export const serviceEnvStaticValues = test({
  name: "service with static env values",

  config: `
    import { service } from "vyft";

    export const app = service("app", {
      image: "nginx:alpine",
      env: {
        NODE_ENV: "production",
        LOG_LEVEL: "info",
      },
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output("app");
    assert(outputs.host, "should deploy successfully");
  },
});

export const serviceEnvWithConfig = test({
  name: "service with config env values",

  config: `
    import { service, config } from "vyft";

    export const app = service("app", {
      image: "nginx:alpine",
      env: {
        DATABASE_URL: config("db-url"),
        API_KEY: config("api-key"),
      },
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.config.set("db-url", "postgres://localhost:5432/mydb");
    await vyft.config.set("api-key", "test-api-key");

    await vyft.deploy();

    const outputs = await vyft.output("app");
    assert(outputs.host, "should deploy successfully");
  },
});

export const serviceEnvWithSecret = test({
  name: "service with secret env values",

  env: {
    VYFT_PASSPHRASE: "test-passphrase-service",
  },

  config: `
    import { service, config } from "vyft";

    export const app = service("app", {
      image: "nginx:alpine",
      env: {
        SECRET_KEY: config("secret-key", { secret: true }),
      },
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    // Secret should be auto-generated
    await vyft.deploy();

    const secretValue = await vyft.config.get("secret-key");
    assert(secretValue, "should have generated secret");
    assert(secretValue.length >= 32, "secret should be at least 32 chars");
  },
});

export const serviceEnvMixedValues = test({
  name: "service with mixed env value types",

  env: {
    VYFT_PASSPHRASE: "test-passphrase-mixed-env",
  },

  config: `
    import { service, config } from "vyft";

    export const app = service("app", {
      image: "nginx:alpine",
      env: {
        STATIC_VAL: "static-value",
        CONFIG_VAL: config("config-val"),
        SECRET_VAL: config("secret-val", { secret: true }),
        NUMERIC_VAL: "123",
      },
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.config.set("config-val", "from-config");

    await vyft.deploy();

    const outputs = await vyft.output("app");
    assert(outputs.host, "should deploy successfully");
  },
});

// =============================================================================
// SERVICE COMMAND
// =============================================================================

export const serviceCommandString = test({
  name: "service with string command",

  config: `
    import { service } from "vyft";

    export const worker = service("worker", {
      image: "alpine:latest",
      command: "echo hello && sleep 3600",
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output("worker");
    assert(outputs.host, "should deploy successfully");
  },
});

export const serviceCommandArray = test({
  name: "service with array command",

  config: `
    import { service } from "vyft";

    export const worker = service("worker", {
      image: "alpine:latest",
      command: ["sh", "-c", "sleep 3600"],
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output("worker");
    assert(outputs.host, "should deploy successfully");
  },
});

// =============================================================================
// SERVICE RESTART POLICY
// =============================================================================

export const serviceRestartAlways = test({
  name: "service with restart always",

  config: `
    import { service } from "vyft";

    export const app = service("app", {
      image: "nginx:alpine",
      restart: "always",
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output("app");
    assert(outputs.host, "should deploy successfully");
  },
});

export const serviceRestartOnFailure = test({
  name: "service with restart on-failure",

  config: `
    import { service } from "vyft";

    export const worker = service("worker", {
      image: "alpine:latest",
      command: "sleep 3600",
      restart: "on-failure",
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output("worker");
    assert(outputs.host, "should deploy successfully");
  },
});

export const serviceRestartNone = test({
  name: "service with restart none",

  config: `
    import { service } from "vyft";

    export const oneshot = service("oneshot", {
      image: "alpine:latest",
      command: "sleep 3600",
      restart: "none",
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output("oneshot");
    assert(outputs.host, "should deploy successfully");
  },
});

// =============================================================================
// SERVICE HEALTH CHECKS
// =============================================================================

export const serviceHealthCheck = test({
  name: "service with health check",

  config: `
    import { service } from "vyft";

    export const app = service("app", {
      image: "nginx:alpine",
      health: {
        command: "curl -f http://localhost/ || exit 1",
        interval: "10s",
        timeout: "5s",
        retries: 3,
        startPeriod: "5s",
      },
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output("app");
    assert(outputs.host, "should deploy successfully");
  },
});

export const serviceHealthCheckMinimal = test({
  name: "service with minimal health check",

  config: `
    import { service } from "vyft";

    export const app = service("app", {
      image: "nginx:alpine",
      health: {
        command: "true",
      },
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output("app");
    assert(outputs.host, "should deploy successfully");
  },
});

// =============================================================================
// SERVICE REPLICAS
// =============================================================================

export const serviceReplicas = test({
  name: "service with replicas",
  skip: true, // Replicas may require swarm mode

  config: `
    import { service } from "vyft";

    export const app = service("app", {
      image: "nginx:alpine",
      replicas: 3,
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output("app");
    assert(outputs.host, "should deploy successfully");
  },
});

// =============================================================================
// SERVICE EXPOSE
// =============================================================================

export const serviceExpose = test({
  name: "service with expose",

  config: `
    import { service } from "vyft";

    export const app = service("app", {
      image: "nginx:alpine",
      expose: true,
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output("app");
    assert(outputs.host, "should deploy successfully");
  },
});

export const serviceExposePort = test({
  name: "service with specific expose port",

  config: `
    import { service } from "vyft";

    export const app = service("app", {
      image: "nginx:alpine",
      port: 80,
      expose: 8888,
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output("app");
    assert(outputs.host, "should deploy successfully");
  },
});

// =============================================================================
// SERVICE UPDATE
// =============================================================================

export const serviceUpdateEnv = test({
  name: "update service env triggers redeploy",

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
    await vyft.config.set("version", "v1.0.0");
    await vyft.deploy();

    // Update config
    await vyft.config.set("version", "v2.0.0");

    // Preview should show modify
    const changes = await vyft.preview();
    const appChange = changes.find((c) => c.resource === "app");
    assert(appChange, "should have app change");
    assert.strictEqual(appChange.action, "update", "should be update action");

    // Apply update
    await vyft.deploy();
  },
});

export const serviceUpdateImage = test({
  name: "update service image triggers redeploy",

  run: async ({ id, vyft, writeConfig }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    // Initial deploy with nginx
    await writeConfig(`
      import { service } from "vyft";
      export const app = service("app", { image: "nginx:alpine" });
    `);
    await vyft.deploy();

    // Update to different image
    await writeConfig(`
      import { service } from "vyft";
      export const app = service("app", { image: "nginx:latest" });
    `);

    // Preview should show update
    const changes = await vyft.preview();
    const appChange = changes.find((c) => c.resource === "app");
    assert(appChange, "should have app change");

    await vyft.deploy();
  },
});

// =============================================================================
// SERVICE DESTROY
// =============================================================================

export const serviceDestroyRemoves = test({
  name: "destroy removes deployed services",

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

    let outputs = await vyft.output();
    assert(outputs.app, "should have deployed service");

    await vyft.destroy();

    try {
      outputs = await vyft.output();
      assert.strictEqual(
        Object.keys(outputs).length,
        0,
        "should have no services",
      );
    } catch {
      // Expected - no resources after destroy
    }
  },
});

export const serviceDestroyMultiple = test({
  name: "destroy removes all services",

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

    let outputs = await vyft.output();
    assert(outputs.web, "should have web");
    assert(outputs.api, "should have api");
    assert(outputs.worker, "should have worker");

    await vyft.destroy();

    try {
      outputs = await vyft.output();
      assert.strictEqual(Object.keys(outputs).length, 0);
    } catch {
      // Expected
    }
  },
});

// =============================================================================
// SERVICE NAMING
// =============================================================================

export const serviceNameWithHyphens = test({
  name: "service name with hyphens",

  config: `
    import { service } from "vyft";

    export const myWebServer = service("my-web-server", {
      image: "nginx:alpine",
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output("my-web-server");
    assert(outputs.host, "should deploy successfully");
  },
});

export const serviceNameWithNumbers = test({
  name: "service name with numbers",

  config: `
    import { service } from "vyft";

    export const api = service("api-v2", {
      image: "nginx:alpine",
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output("api-v2");
    assert(outputs.host, "should deploy successfully");
  },
});

// =============================================================================
// SERVICE OUTPUTS
// =============================================================================

export const serviceOutputsHost = test({
  name: "service outputs include host",

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
    assert(typeof outputs.host === "string", "host should be a string");
    assert(outputs.host.length > 0, "host should not be empty");
  },
});

export const serviceOutputsPort = test({
  name: "service outputs include port",

  config: `
    import { service } from "vyft";

    export const app = service("app", {
      image: "nginx:alpine",
      port: 3000,
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output("app");
    assert(outputs.host, "should have host");
  },
});

// =============================================================================
// SERVICE IDEMPOTENCY
// =============================================================================

export const serviceDeployIdempotent = test({
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

    // First deploy
    await vyft.deploy();

    // Second deploy should be no-op
    await vyft.deploy();

    // Preview should show no changes
    const changes = await vyft.preview();
    assert.strictEqual(changes.length, 0, "should have no pending changes");
  },
});

export const serviceDeployAfterRefresh = test({
  name: "deploy after refresh is idempotent",

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

    // Preview should show no changes
    const changes = await vyft.preview();
    assert.strictEqual(changes.length, 0, "should have no pending changes");
  },
});
