import assert from "node:assert";
import { describe, test } from "node:test";
import { sandbox } from "../src/index.ts";

describe("config", { concurrency: false }, () => {
  // =============================================================================
  // BASIC CONFIG OPERATIONS
  // =============================================================================

  test("config set and get", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service, config } from "vyft";
    export const app = service("app", {
      image: "nginx:alpine",
      env: { KEY: config("my-key") },
    });
  `,
    );

    await box.vyft.config.set("my-key", "my-value");

    const value = await box.vyft.config.get("my-key");
    assert.strictEqual(value, "my-value");
  });

  test("config overwrite", async () => {
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

    await box.vyft.config.set("key", "first");
    await box.vyft.config.set("key", "second");

    const value = await box.vyft.config.get("key");
    assert.strictEqual(value, "second");
  });

  test("config get nonexistent returns undefined", async () => {
    await using box = await sandbox();

    await box.fs.write("vyft.config.ts", `export default {};`);

    const value = await box.vyft.config.get("nonexistent");
    assert.strictEqual(value, undefined);
  });

  test("config empty value", async () => {
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

    await box.vyft.config.set("key", "");

    const value = await box.vyft.config.get("key");
    assert.strictEqual(value, "");
  });

  // =============================================================================
  // SPECIAL CHARACTERS
  // =============================================================================

  test("config with special characters", async () => {
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

    await box.vyft.config.set("key", "hello!@#$%^&*()");

    const value = await box.vyft.config.get("key");
    assert.strictEqual(value, "hello!@#$%^&*()");
  });

  test("config with JSON string", async () => {
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

    const jsonValue = '{"foo":"bar","num":123}';
    await box.vyft.config.set("key", jsonValue);

    const value = await box.vyft.config.get("key");
    assert.strictEqual(value, jsonValue);
  });

  // =============================================================================
  // CONFIG REMOVE
  // =============================================================================

  test("config rm removes value", async () => {
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
    await box.vyft.config.rm("key");

    const value = await box.vyft.config.get("key");
    assert.strictEqual(value, undefined);
  });

  // =============================================================================
  // SECRETS
  // =============================================================================

  test("config set secret", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service, config } from "vyft";
    export const app = service("app", {
      image: "nginx:alpine",
      env: { PASSWORD: config("password", { secret: true, generated: false }) },
    });
  `,
    );

    await box.vyft.config.set("password", "super-secret", { secret: true });

    const value = await box.vyft.config.get("password");
    assert.strictEqual(value, "super-secret");
  });

  // =============================================================================
  // CONFIG IN DEPLOY
  // =============================================================================

  test("config used in deploy", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service, config } from "vyft";
    export const app = service("app", {
      image: "nginx:alpine",
      env: { API_URL: config("api-url") },
    });
  `,
    );

    await box.vyft.config.set("api-url", "https://api.example.com");
    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.app, "should deploy with config");
  });

  test("missing required config fails deploy", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service, config } from "vyft";
    export const app = service("app", {
      image: "nginx:alpine",
      env: { API_URL: config("api-url") },
    });
  `,
    );

    try {
      await box.vyft.deploy();
      assert.fail("should have thrown");
    } catch (err) {
      assert(err instanceof Error);
      assert(
        err.message.includes("api-url") || err.message.includes("no value"),
      );
    }
  });

  // =============================================================================
  // CONFIG PERSISTENCE
  // =============================================================================

  test("config persists across commands", async () => {
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

    await box.vyft.config.set("key", "persistent-value");

    // Get multiple times
    const v1 = await box.vyft.config.get("key");
    const v2 = await box.vyft.config.get("key");
    const v3 = await box.vyft.config.get("key");

    assert.strictEqual(v1, "persistent-value");
    assert.strictEqual(v2, "persistent-value");
    assert.strictEqual(v3, "persistent-value");
  });

  // =============================================================================
  // AUTO-GENERATED SECRETS
  // =============================================================================

  test("secret auto-generates on deploy", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service, config } from "vyft";
    export const app = service("app", {
      image: "nginx:alpine",
      env: { SECRET: config("auto-secret", { secret: true }) },
    });
  `,
    );

    await box.vyft.deploy();

    const value = await box.vyft.config.get("auto-secret");
    assert(value, "should have generated value");
    assert(value.length >= 32, "should be at least 32 chars");
  });

  test("secret preserved on redeploy", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service, config } from "vyft";
    export const app = service("app", {
      image: "nginx:alpine",
      env: { SECRET: config("my-secret", { secret: true }) },
    });
  `,
    );

    await box.vyft.deploy();
    const first = await box.vyft.config.get("my-secret");

    await box.vyft.deploy();
    const second = await box.vyft.config.get("my-secret");

    assert.strictEqual(first, second, "secret should be preserved");
  });
});
