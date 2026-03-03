import assert from "node:assert";
import { describe, test } from "node:test";
import { sandbox } from "../src/index.ts";

describe("service", { concurrency: false }, () => {
  // =============================================================================
  // BASIC SERVICE DEPLOYMENT
  // =============================================================================

  test("deploy service with image", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const web = service("web", { image: "nginx:alpine" });
  `,
    );

    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.web, "should have web");
  });

  test("deploy service with custom port", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const api = service("api", { image: "nginx:alpine", port: 8080 });
  `,
    );

    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.api, "should have api");
  });

  test("deploy multiple services", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const web = service("web", { image: "nginx:alpine" });
    export const api = service("api", { image: "nginx:alpine", port: 8080 });
  `,
    );

    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.web, "should have web");
    assert(outputs.api, "should have api");
  });

  // =============================================================================
  // ENVIRONMENT VARIABLES
  // =============================================================================

  test("service with static env vars", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const app = service("app", {
      image: "nginx:alpine",
      env: { FOO: "bar", BAZ: "qux" },
    });
  `,
    );

    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.app, "should deploy with env vars");
  });

  test("service with config values", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service, config } from "vyft";
    export const app = service("app", {
      image: "nginx:alpine",
      env: { API_KEY: config("api-key") },
    });
  `,
    );

    await box.vyft.config.set("api-key", "secret123");
    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.app, "should deploy with config value");
  });

  test("service with secret config", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service, config } from "vyft";
    export const app = service("app", {
      image: "nginx:alpine",
      env: { DB_PASSWORD: config("db-password", { secret: true }) },
    });
  `,
    );

    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.app, "should deploy with auto-generated secret");
  });

  test("service with mixed env types", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service, config } from "vyft";
    export const app = service("app", {
      image: "nginx:alpine",
      env: {
        STATIC: "value",
        FROM_CONFIG: config("my-config"),
        SECRET: config("my-secret", { secret: true }),
      },
    });
  `,
    );

    await box.vyft.config.set("my-config", "config-value");
    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.app, "should deploy with mixed env");
  });

  // =============================================================================
  // COMMAND
  // =============================================================================

  test("service with string command", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const app = service("app", {
      image: "alpine:latest",
      command: "sleep 3600",
    });
  `,
    );

    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.app, "should deploy with string command");
  });

  test("service with array command", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const app = service("app", {
      image: "alpine:latest",
      command: ["sh", "-c", "sleep 3600"],
    });
  `,
    );

    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.app, "should deploy with array command");
  });

  // =============================================================================
  // RESTART POLICIES
  // =============================================================================

  test("service with restart always", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const app = service("app", {
      image: "nginx:alpine",
      restart: "always",
    });
  `,
    );

    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.app, "should deploy with restart always");
  });

  test("service with restart on-failure", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const app = service("app", {
      image: "nginx:alpine",
      restart: "on-failure",
    });
  `,
    );

    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.app, "should deploy with restart on-failure");
  });

  test("service with restart none", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const app = service("app", {
      image: "alpine:latest",
      command: "sleep 3600",
      restart: "none",
    });
  `,
    );

    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.app, "should deploy with restart none");
  });

  // =============================================================================
  // HEALTH CHECKS
  // =============================================================================

  test("service with full health check", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
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
    );

    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.app, "should deploy with health check");
  });

  test("service with minimal health check", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const app = service("app", {
      image: "nginx:alpine",
      health: { command: "curl -f http://localhost/" },
    });
  `,
    );

    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.app, "should deploy with minimal health check");
  });

  // =============================================================================
  // EXPOSE
  // =============================================================================

  test("service with expose true", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const app = service("app", {
      image: "nginx:alpine",
      expose: true,
    });
  `,
    );

    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.app, "should deploy with expose");
  });

  test("service with expose specific port", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const app = service("app", {
      image: "nginx:alpine",
      expose: 8888,
    });
  `,
    );

    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.app, "should deploy with specific expose port");
  });

  // =============================================================================
  // UPDATES
  // =============================================================================

  test("env change triggers update", async () => {
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
      "should detect env change",
    );
  });

  test("image change triggers update", async () => {
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
      "should detect image change",
    );
  });

  // =============================================================================
  // DESTROY
  // =============================================================================

  test("destroy removes service", async () => {
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

  test("destroy removes multiple services", async () => {
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
    await box.vyft.destroy();

    const changes = await box.vyft.preview();
    assert(changes.length === 2, "should show create for both services");
  });

  // =============================================================================
  // NAMING
  // =============================================================================

  test("service name with hyphens", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const app = service("my-web-app", { image: "nginx:alpine" });
  `,
    );

    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs["my-web-app"], "should deploy with hyphenated name");
  });

  test("service name with numbers", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const app = service("app123", { image: "nginx:alpine" });
  `,
    );

    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.app123, "should deploy with numeric name");
  });

  // =============================================================================
  // OUTPUTS
  // =============================================================================

  test("output includes host", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const app = service("app", { image: "nginx:alpine" });
  `,
    );

    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    const app = outputs.app as { host?: string };
    assert.strictEqual(app.host, "app", "host should equal service id");
  });

  test("output reflects port", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const app = service("app", { image: "nginx:alpine", port: 8080 });
  `,
    );

    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    const app = outputs.app as { port?: number };
    assert.strictEqual(app.port, 8080, "port should match config");
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
    assert.strictEqual(changes.length, 0, "should have no changes");
  });

  test("deploy after refresh is idempotent", async () => {
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
    await box.vyft.deploy();

    const changes = await box.vyft.preview();
    assert.strictEqual(changes.length, 0, "should have no changes");
  });
});
