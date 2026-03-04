import assert from "node:assert";
import { describe, test } from "node:test";
import { sandbox } from "../../src/index.ts";

/**
 * Full Stack Deployment Journey
 *
 * Tests the complete lifecycle of deploying a realistic application:
 * - Web service with dependencies on db and cache
 * - PostgreSQL database with persistent volume
 * - Redis cache
 * - Auto-generated secrets
 * - Cronjob for background tasks
 *
 * Covers: service, volume, linking, dependencies, config, preview, deploy,
 * output, diff, update, cronjob, destroy
 */
describe("journey: full-stack deployment", { concurrency: false }, () => {
  test("deploy, update, and destroy a complete application stack", async () => {
    await using box = await sandbox();

    // =========================================================================
    // STEP 1: Initial Config - Web + DB + Cache + Volume
    // =========================================================================

    await box.fs.write(
      "vyft.config.ts",
      `
import { service, volume, config } from "vyft";

// Database with persistent storage
export const dbVolume = volume("db-data");

// Shared secrets - define once, reference multiple times
const dbPassword = config("DB_PASSWORD", { secret: true }); // Auto-generated
const appSecret = config("APP_SECRET", { secret: true }); // Auto-generated
const logLevel = config("LOG_LEVEL"); // Plain config, user must set

export const db = service("db", {
  image: "postgres:16-alpine",
  port: 5432,
  env: {
    POSTGRES_USER: "app",
    POSTGRES_PASSWORD: dbPassword,
    POSTGRES_DB: "appdb",
  },
  mounts: [{ source: dbVolume, path: "/var/lib/postgresql/data" }],
});

// Redis cache
export const cache = service("cache", {
  image: "redis:7-alpine",
  port: 6379,
});

// Web service - uses links to connect to db and cache
export const web = service("web", {
  image: "nginx:alpine",
  port: 80,
  env: {
    // Reference the same config objects
    DB_PASSWORD: dbPassword,
    APP_SECRET: appSecret,
    LOG_LEVEL: logLevel,
  },
  dependsOn: [db, cache],
  link: [db, cache],
});
`,
    );

    // Only set the config value that can't be auto-generated
    await box.vyft.config.set("LOG_LEVEL", "info");

    // =========================================================================
    // STEP 2: Preview - Should show creates for all resources
    // =========================================================================

    const initialPreview = await box.vyft.preview();

    const creates = initialPreview.filter((c) => c.action === "create");
    assert(
      creates.length >= 4,
      `expected at least 4 creates, got ${creates.length}`,
    );

    const resourceNames = creates.map((c) => c.resource);
    assert(resourceNames.includes("db"), "should create db");
    assert(resourceNames.includes("cache"), "should create cache");
    assert(resourceNames.includes("web"), "should create web");
    assert(resourceNames.includes("db-data"), "should create volume");

    // =========================================================================
    // STEP 3: Deploy
    // =========================================================================

    await box.vyft.deploy();

    // =========================================================================
    // STEP 4: Verify outputs
    // =========================================================================

    const outputs = await box.vyft.output();

    assert(outputs.db, "should have db output");
    assert(outputs.cache, "should have cache output");
    assert(outputs.web, "should have web output");

    // =========================================================================
    // STEP 5: Diff - Should show no drift
    // =========================================================================

    const diffResult = await box.vyft.diff();
    assert.strictEqual(
      diffResult.hasDrift,
      false,
      "should have no drift after deploy",
    );

    // =========================================================================
    // STEP 6: Preview after deploy - Should show no changes
    // =========================================================================

    const noChangesPreview = await box.vyft.preview();
    assert.strictEqual(
      noChangesPreview.length,
      0,
      "should have no pending changes",
    );

    // =========================================================================
    // STEP 7: Update - Change web image tag
    // =========================================================================

    await box.fs.write(
      "vyft.config.ts",
      `
import { service, volume, config } from "vyft";

export const dbVolume = volume("db-data");

// Shared secrets
const dbPassword = config("DB_PASSWORD", { secret: true });
const appSecret = config("APP_SECRET", { secret: true });
const logLevel = config("LOG_LEVEL");

export const db = service("db", {
  image: "postgres:16-alpine",
  port: 5432,
  env: {
    POSTGRES_USER: "app",
    POSTGRES_PASSWORD: dbPassword,
    POSTGRES_DB: "appdb",
  },
  mounts: [{ source: dbVolume, path: "/var/lib/postgresql/data" }],
});

export const cache = service("cache", {
  image: "redis:7-alpine",
  port: 6379,
});

// Updated: changed image from nginx:alpine to nginx:1.25-alpine
export const web = service("web", {
  image: "nginx:1.25-alpine",
  port: 80,
  env: {
    DB_PASSWORD: dbPassword,
    APP_SECRET: appSecret,
    LOG_LEVEL: logLevel,
  },
  dependsOn: [db, cache],
  link: [db, cache],
});
`,
    );

    // Preview should show update for web
    const updatePreview = await box.vyft.preview();
    const updates = updatePreview.filter((c) => c.action === "update");
    assert(updates.length >= 1, "should have at least 1 update");
    assert(
      updates.some((u) => u.resource === "web"),
      "should update web service",
    );

    // Deploy the update
    await box.vyft.deploy();

    // Verify no drift after update
    const diffAfterUpdate = await box.vyft.diff();
    assert.strictEqual(
      diffAfterUpdate.hasDrift,
      false,
      "should have no drift after update",
    );

    // =========================================================================
    // STEP 8: Add a cronjob
    // =========================================================================

    await box.fs.write(
      "vyft.config.ts",
      `
import { service, volume, config, cronjob } from "vyft";

export const dbVolume = volume("db-data");

// Shared secrets
const dbPassword = config("DB_PASSWORD", { secret: true });
const appSecret = config("APP_SECRET", { secret: true });
const logLevel = config("LOG_LEVEL");

export const db = service("db", {
  image: "postgres:16-alpine",
  port: 5432,
  env: {
    POSTGRES_USER: "app",
    POSTGRES_PASSWORD: dbPassword,
    POSTGRES_DB: "appdb",
  },
  mounts: [{ source: dbVolume, path: "/var/lib/postgresql/data" }],
});

export const cache = service("cache", {
  image: "redis:7-alpine",
  port: 6379,
});

export const web = service("web", {
  image: "nginx:1.25-alpine",
  port: 80,
  env: {
    DB_PASSWORD: dbPassword,
    APP_SECRET: appSecret,
    LOG_LEVEL: logLevel,
  },
  dependsOn: [db, cache],
  link: [db, cache],
});

// New: cleanup cronjob that runs nightly
export const cleanup = cronjob("cleanup", {
  image: "alpine:latest",
  schedule: "0 2 * * *",
  command: "echo 'cleanup done'",
});
`,
    );

    // Preview should show create for cronjob
    const cronjobPreview = await box.vyft.preview();
    const cronjobCreates = cronjobPreview.filter(
      (c) => c.action === "create" && c.resource === "cleanup",
    );
    assert.strictEqual(
      cronjobCreates.length,
      1,
      "should create cleanup cronjob",
    );

    // Deploy with cronjob
    await box.vyft.deploy();

    // =========================================================================
    // STEP 9: Destroy everything
    // =========================================================================

    await box.vyft.destroy();

    // Verify everything is gone - preview should show creates again
    const afterDestroyPreview = await box.vyft.preview();
    assert(
      afterDestroyPreview.length >= 5,
      "should show creates for all resources after destroy",
    );
  });

  test("auto-generated secrets persist across deploys", async () => {
    await using box = await sandbox();

    // Deploy with auto-generated secret
    await box.fs.write(
      "vyft.config.ts",
      `
import { service, config } from "vyft";

export const app = service("app", {
  image: "nginx:alpine",
  env: {
    API_KEY: config("API_KEY", { secret: true }), // Auto-generated
    PUBLIC_URL: config("PUBLIC_URL"),
  },
});
`,
    );

    // Only set the non-secret config
    await box.vyft.config.set("PUBLIC_URL", "https://example.com");

    await box.vyft.deploy();

    // Get the auto-generated secret value
    const generatedKey = await box.vyft.config.get("API_KEY");
    assert(generatedKey, "API_KEY should be auto-generated");
    assert(generatedKey.length > 0, "API_KEY should have a value");

    // Update config and redeploy
    await box.vyft.config.set("PUBLIC_URL", "https://newdomain.com");
    await box.vyft.deploy();

    // Verify auto-generated secret persists (not regenerated)
    const stillSameKey = await box.vyft.config.get("API_KEY");
    assert.strictEqual(
      stillSameKey,
      generatedKey,
      "auto-generated secret should persist",
    );

    // Verify updated config
    const updatedUrl = await box.vyft.config.get("PUBLIC_URL");
    assert.strictEqual(updatedUrl, "https://newdomain.com");
  });

  test("dependency ordering - deploy and destroy order", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
import { service } from "vyft";

// Chain: db -> api -> web
export const db = service("db", {
  image: "redis:7-alpine",
  port: 6379,
});

export const api = service("api", {
  image: "nginx:alpine",
  port: 8080,
  dependsOn: [db],
});

export const web = service("web", {
  image: "nginx:alpine",
  port: 80,
  dependsOn: [api],
});
`,
    );

    // Deploy - dependencies should be deployed first
    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.db, "db should be deployed");
    assert(outputs.api, "api should be deployed");
    assert(outputs.web, "web should be deployed");

    // Destroy - dependents should be destroyed first
    await box.vyft.destroy();

    // All should be gone
    const preview = await box.vyft.preview();
    assert.strictEqual(preview.length, 3, "should need to create all 3 again");
  });
});
