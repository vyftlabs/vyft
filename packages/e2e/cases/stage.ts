import assert from "node:assert";
import { test } from "../src/index.ts";

// =============================================================================
// STAGE LIST OPERATIONS
// =============================================================================

export const stageLocalExists = test({
  name: "local stage always exists",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);

    const result = await vyft.stage.ls();
    assert(result.items.includes("local"), "local stage should always exist");
  },
});

export const stageLsReturnsArray = test({
  name: "stage ls returns array of stages",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);

    const result = await vyft.stage.ls();
    assert(Array.isArray(result.items), "items should be an array");
  },
});

export const stageLsShowsActive = test({
  name: "stage ls shows active stage",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create("production");
    await vyft.stage.use("production");

    const result = await vyft.stage.ls();
    assert.strictEqual(
      result.active,
      "production",
      "active should be production",
    );
  },
});

// =============================================================================
// STAGE CREATE OPERATIONS
// =============================================================================

export const stageCreate = test({
  name: "stage create adds new stage",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);

    await vyft.stage.create("staging");

    const result = await vyft.stage.ls();
    assert(result.items.includes("staging"), "should include new stage");
  },
});

export const stageCreateMultiple = test({
  name: "can create multiple stages",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);

    await vyft.stage.create("dev");
    await vyft.stage.create("staging");
    await vyft.stage.create("production");

    const result = await vyft.stage.ls();
    assert(result.items.includes("dev"), "should include dev");
    assert(result.items.includes("staging"), "should include staging");
    assert(result.items.includes("production"), "should include production");
    assert(result.items.includes("local"), "should still include local");
  },
});

export const stageCreateDuplicateFails = test({
  name: "stage create fails for duplicate name",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create("mytest");

    try {
      await vyft.stage.create("mytest");
      assert.fail("should throw on duplicate stage");
    } catch (err) {
      assert(err instanceof Error);
      assert(err.message.includes("stage create failed"));
    }
  },
});

export const stageCreateLocalFails = test({
  name: "stage create fails for 'local' name",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);

    try {
      await vyft.stage.create("local");
      assert.fail("should fail creating local stage");
    } catch (err) {
      assert(err instanceof Error);
      assert(
        err.message.includes("stage create failed") ||
          err.message.includes("local") ||
          err.message.includes("reserved"),
        `unexpected error: ${err.message}`,
      );
    }
  },
});

// =============================================================================
// STAGE USE OPERATIONS
// =============================================================================

export const stageUse = test({
  name: "stage use switches active stage",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);

    await vyft.stage.create("staging");
    await vyft.stage.create("production");

    await vyft.stage.use("staging");
    let result = await vyft.stage.ls();
    assert.strictEqual(result.active, "staging");

    await vyft.stage.use("production");
    result = await vyft.stage.ls();
    assert.strictEqual(result.active, "production");
  },
});

export const stageUseLocal = test({
  name: "stage use can switch to local",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create("production");
    await vyft.stage.use("production");

    await vyft.stage.use("local");

    const result = await vyft.stage.ls();
    assert.strictEqual(result.active, "local");
  },
});

export const stageUseNonexistentFails = test({
  name: "stage use fails for nonexistent stage",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);

    try {
      await vyft.stage.use("nonexistent-stage");
      assert.fail("should throw for nonexistent stage");
    } catch (err) {
      assert(err instanceof Error);
      assert(err.message.includes("stage use failed"));
    }
  },
});

// =============================================================================
// STAGE REMOVE OPERATIONS
// =============================================================================

export const stageRm = test({
  name: "stage rm removes stage",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create("temporary");

    let result = await vyft.stage.ls();
    assert(result.items.includes("temporary"));

    await vyft.stage.rm("temporary");

    result = await vyft.stage.ls();
    assert(!result.items.includes("temporary"), "stage should be removed");
  },
});

export const stageRmLocalFails = test({
  name: "stage rm fails for local stage",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);

    try {
      await vyft.stage.rm("local");
      assert.fail("should fail removing local stage");
    } catch (err) {
      assert(err instanceof Error);
      assert(err.message.includes("stage rm failed"));
    }
  },
});

export const stageRmNonexistentFails = test({
  name: "stage rm fails for nonexistent stage",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);

    try {
      await vyft.stage.rm("nonexistent-stage");
      assert.fail("should throw for nonexistent stage");
    } catch (err) {
      assert(err instanceof Error);
      assert(err.message.includes("stage rm failed"));
    }
  },
});

export const stageRmClearsActive = test({
  name: "stage rm clears active if removed",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create("temporary");
    await vyft.stage.use("temporary");

    let result = await vyft.stage.ls();
    assert.strictEqual(result.active, "temporary");

    await vyft.stage.rm("temporary");

    result = await vyft.stage.ls();
    assert(result.active !== "temporary", "active should not be removed stage");
  },
});

// =============================================================================
// STAGE ISOLATION
// =============================================================================

export const stageIsolatesConfig = test({
  name: "config values are isolated per stage",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);

    // Set value in dev stage
    await vyft.stage.create("dev");
    await vyft.config.set("APP_ENV", "development");

    // Set different value in prod stage
    await vyft.stage.create("prod");
    await vyft.config.set("APP_ENV", "production");

    // Verify isolation
    await vyft.stage.use("dev");
    const devValue = await vyft.config.get("APP_ENV");
    assert.strictEqual(devValue, "development");

    await vyft.stage.use("prod");
    const prodValue = await vyft.config.get("APP_ENV");
    assert.strictEqual(prodValue, "production");
  },
});

export const stageIsolatesSecrets = test({
  name: "secrets are isolated per stage",

  env: {
    VYFT_PASSPHRASE: "test-passphrase-for-secrets",
  },

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);

    // Set secret in staging
    await vyft.stage.create("staging");
    await vyft.config.set("API_KEY", "staging-key-123", { secret: true });

    // Set different secret in production
    await vyft.stage.create("production");
    await vyft.config.set("API_KEY", "production-key-456", { secret: true });

    // Verify isolation
    await vyft.stage.use("staging");
    const stagingKey = await vyft.config.get("API_KEY");
    assert.strictEqual(stagingKey, "staging-key-123");

    await vyft.stage.use("production");
    const prodKey = await vyft.config.get("API_KEY");
    assert.strictEqual(prodKey, "production-key-456");
  },
});

export const stageIsolatesDeployments = test({
  name: "deployments are isolated per stage",

  config: `
    import { service } from "vyft";

    export const api = service("api", {
      image: "nginx:alpine",
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);

    // Deploy in staging
    await vyft.stage.create("staging");
    await vyft.deploy();

    // Production should show create (not already deployed)
    await vyft.stage.create("production");
    const changes = await vyft.preview();
    assert(
      changes.some((c) => c.action === "create"),
      "should show create in separate stage",
    );

    // Clean up both stages
    await vyft.destroy();
    await vyft.stage.use("staging");
    await vyft.destroy();
  },
});

// =============================================================================
// STAGE NAMING VALIDATION
// =============================================================================

export const stageNameWithHyphens = test({
  name: "stage name can contain hyphens",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create("my-stage-name");

    const result = await vyft.stage.ls();
    assert(result.items.includes("my-stage-name"));
  },
});

export const stageNameWithNumbers = test({
  name: "stage name can contain numbers",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create("stage123");

    const result = await vyft.stage.ls();
    assert(result.items.includes("stage123"));
  },
});

export const stageInvalidNameFails = test({
  name: "stage create fails for invalid name",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);

    try {
      await vyft.stage.create("Invalid_Name!");
      assert.fail("should fail for invalid stage name");
    } catch (err) {
      assert(err instanceof Error);
      assert(
        err.message.includes("stage create failed") ||
          err.message.includes("invalid") ||
          err.message.includes("Invalid"),
        `unexpected error: ${err.message}`,
      );
    }
  },
});

// =============================================================================
// STAGE WITH DEPLOYMENTS
// =============================================================================

export const stageDeployPreservesConfig = test({
  name: "stage config persists after deploy",

  config: `
    import { service, config } from "vyft";

    export const app = service("app", {
      image: "nginx:alpine",
      env: {
        VERSION: config("app-version"),
      },
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create("test");

    await vyft.config.set("app-version", "v1.0.0");
    await vyft.deploy();

    // Verify config still exists after deploy
    const value = await vyft.config.get("app-version");
    assert.strictEqual(value, "v1.0.0");
  },
});

export const stageDestroyPreservesConfig = test({
  name: "stage config persists after destroy",

  config: `
    import { service, config } from "vyft";

    export const app = service("app", {
      image: "nginx:alpine",
      env: {
        VERSION: config("app-version"),
      },
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create("test");

    await vyft.config.set("app-version", "v2.0.0");
    await vyft.deploy();
    await vyft.destroy();

    // Verify config still exists after destroy
    const value = await vyft.config.get("app-version");
    assert.strictEqual(value, "v2.0.0");
  },
});
