import assert from "node:assert";
import { test } from "../src/index.ts";

// =============================================================================
// CONFIG SET AND GET OPERATIONS
// =============================================================================

export const configSetAndGet = test({
  name: "config set and get plain value",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.config.set("DATABASE_URL", "postgres://localhost:5432/db");

    const value = await vyft.config.get("DATABASE_URL");
    assert.strictEqual(value, "postgres://localhost:5432/db");
  },
});

export const configSetOverwrites = test({
  name: "config set overwrites existing value",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.config.set("API_URL", "http://localhost:3000");
    await vyft.config.set("API_URL", "http://localhost:4000");

    const value = await vyft.config.get("API_URL");
    assert.strictEqual(value, "http://localhost:4000");
  },
});

export const configGetNonexistent = test({
  name: "config get returns undefined for nonexistent key",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    const value = await vyft.config.get("NONEXISTENT_KEY");
    assert.strictEqual(value, undefined);
  },
});

export const configSetEmptyValue = test({
  name: "config set accepts empty string",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.config.set("EMPTY_VAL", "");

    const value = await vyft.config.get("EMPTY_VAL");
    assert.strictEqual(value, "");
  },
});

export const configSetSpecialChars = test({
  name: "config set handles special characters",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    const specialValue = "hello=world&foo=bar";
    await vyft.config.set("SPECIAL_CHARS", specialValue);

    const value = await vyft.config.get("SPECIAL_CHARS");
    assert.strictEqual(value, specialValue);
  },
});

export const configSetJsonValue = test({
  name: "config set handles JSON strings",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    const jsonValue = '{"key":"value","num":123}';
    await vyft.config.set("JSON_CONFIG", jsonValue);

    const value = await vyft.config.get("JSON_CONFIG");
    assert.strictEqual(value, jsonValue);
  },
});

export const configSetMultipleValues = test({
  name: "config set multiple values independently",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.config.set("KEY1", "value1");
    await vyft.config.set("KEY2", "value2");
    await vyft.config.set("KEY3", "value3");

    assert.strictEqual(await vyft.config.get("KEY1"), "value1");
    assert.strictEqual(await vyft.config.get("KEY2"), "value2");
    assert.strictEqual(await vyft.config.get("KEY3"), "value3");
  },
});

// =============================================================================
// CONFIG REMOVE OPERATIONS
// =============================================================================

export const configRm = test({
  name: "config rm removes value",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.config.set("TO_REMOVE", "temporary");
    await vyft.config.rm("TO_REMOVE");

    const value = await vyft.config.get("TO_REMOVE");
    assert.strictEqual(value, undefined);
  },
});

export const configRmNonexistent = test({
  name: "config rm fails for nonexistent key",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    try {
      await vyft.config.rm("NONEXISTENT_KEY");
      assert.fail("should fail for nonexistent key");
    } catch (err) {
      assert(err instanceof Error);
      assert(err.message.includes("config rm failed"));
    }
  },
});

export const configRmDoesNotAffectOthers = test({
  name: "config rm does not affect other values",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.config.set("KEEP1", "keep-value-1");
    await vyft.config.set("REMOVE", "remove-me");
    await vyft.config.set("KEEP2", "keep-value-2");

    await vyft.config.rm("REMOVE");

    assert.strictEqual(await vyft.config.get("KEEP1"), "keep-value-1");
    assert.strictEqual(await vyft.config.get("KEEP2"), "keep-value-2");
    assert.strictEqual(await vyft.config.get("REMOVE"), undefined);
  },
});

// =============================================================================
// CONFIG LIST OPERATIONS
// =============================================================================

export const configLsEmpty = test({
  name: "config ls returns empty list initially",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    const result = await vyft.config.ls();
    assert(Array.isArray(result.items));
    assert.strictEqual(result.items.length, 0);
  },
});

export const configLsShowsAll = test({
  name: "config ls lists all values",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.config.set("FOO", "foo-value");
    await vyft.config.set("BAR", "bar-value");
    await vyft.config.set("BAZ", "baz-value");

    const result = await vyft.config.ls();
    const names = result.items.map((i) => i.name);

    assert(names.includes("FOO"), "should include FOO");
    assert(names.includes("BAR"), "should include BAR");
    assert(names.includes("BAZ"), "should include BAZ");
  },
});

export const configLsShowsSecretFlag = test({
  name: "config ls shows secret flag",

  env: {
    VYFT_PASSPHRASE: "test-passphrase-123",
  },

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.config.set("PLAIN_VALUE", "plain");
    await vyft.config.set("SECRET_VALUE", "secret", { secret: true });

    const result = await vyft.config.ls();
    const plain = result.items.find((i) => i.name === "PLAIN_VALUE");
    const secret = result.items.find((i) => i.name === "SECRET_VALUE");

    assert(plain, "should include plain value");
    assert(secret, "should include secret value");
    assert.strictEqual(plain.secret, false);
    assert.strictEqual(secret.secret, true);
  },
});

export const configLsShowsStage = test({
  name: "config ls shows current stage",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create("production");

    await vyft.config.set("KEY", "value");

    const result = await vyft.config.ls();
    assert.strictEqual(result.stage, "production");
  },
});

// =============================================================================
// SECRET CONFIG OPERATIONS
// =============================================================================

export const configSecretSetAndGet = test({
  name: "config set --secret stores encrypted value",

  env: {
    VYFT_PASSPHRASE: "test-passphrase-for-encryption",
  },

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.config.set("API_SECRET", "super-secret-key", { secret: true });

    const value = await vyft.config.get("API_SECRET");
    assert.strictEqual(value, "super-secret-key");
  },
});

export const configSecretCanBeRemoved = test({
  name: "secret config can be removed",

  env: {
    VYFT_PASSPHRASE: "test-passphrase-456",
  },

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.config.set("SECRET_TO_REMOVE", "secret-value", { secret: true });
    await vyft.config.rm("SECRET_TO_REMOVE");

    const value = await vyft.config.get("SECRET_TO_REMOVE");
    assert.strictEqual(value, undefined);
  },
});

export const configSecretCanBeUpdated = test({
  name: "secret config can be updated",

  env: {
    VYFT_PASSPHRASE: "test-passphrase-789",
  },

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.config.set("MUTABLE_SECRET", "version1", { secret: true });
    await vyft.config.set("MUTABLE_SECRET", "version2", { secret: true });

    const value = await vyft.config.get("MUTABLE_SECRET");
    assert.strictEqual(value, "version2");
  },
});

export const configSecretMixedWithPlain = test({
  name: "can mix secret and plain configs",

  env: {
    VYFT_PASSPHRASE: "test-passphrase-mixed",
  },

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.config.set("PLAIN_CONFIG", "plain-value");
    await vyft.config.set("SECRET_CONFIG", "secret-value", { secret: true });
    await vyft.config.set("ANOTHER_PLAIN", "another-plain");

    assert.strictEqual(await vyft.config.get("PLAIN_CONFIG"), "plain-value");
    assert.strictEqual(await vyft.config.get("SECRET_CONFIG"), "secret-value");
    assert.strictEqual(await vyft.config.get("ANOTHER_PLAIN"), "another-plain");

    const result = await vyft.config.ls();
    const secrets = result.items.filter((i) => i.secret);
    const plains = result.items.filter((i) => !i.secret);

    assert.strictEqual(secrets.length, 1);
    assert.strictEqual(plains.length, 2);
  },
});

// =============================================================================
// CONFIG STAGE ISOLATION
// =============================================================================

export const configStageIsolation = test({
  name: "config values are isolated per stage",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);

    // Set in staging
    await vyft.stage.create("staging");
    await vyft.config.set("ENV", "staging-value");

    // Set different in production
    await vyft.stage.create("production");
    await vyft.config.set("ENV", "production-value");

    // Verify isolation
    await vyft.stage.use("staging");
    assert.strictEqual(await vyft.config.get("ENV"), "staging-value");

    await vyft.stage.use("production");
    assert.strictEqual(await vyft.config.get("ENV"), "production-value");
  },
});

export const configOnlyExistsInSetStage = test({
  name: "config only exists in stage where set",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);

    // Set config in staging only
    await vyft.stage.create("staging");
    await vyft.config.set("STAGING_ONLY", "exists");

    // Create production without setting
    await vyft.stage.create("production");

    // Should not exist in production
    const value = await vyft.config.get("STAGING_ONLY");
    assert.strictEqual(value, undefined);

    // Should exist in staging
    await vyft.stage.use("staging");
    const stagingValue = await vyft.config.get("STAGING_ONLY");
    assert.strictEqual(stagingValue, "exists");
  },
});

// =============================================================================
// CONFIG WITH DEPLOY
// =============================================================================

export const configUsedInDeploy = test({
  name: "config values used in deployment",

  config: `
    import { service, config } from "vyft";

    export const app = service("app", {
      image: "nginx:alpine",
      env: {
        APP_VERSION: config("version"),
        APP_ENV: config("environment"),
      },
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.config.set("version", "v1.0.0");
    await vyft.config.set("environment", "testing");

    await vyft.deploy();

    const outputs = await vyft.output("app");
    assert(outputs.host, "should have host output");
  },
});

export const configMissingRequiredFails = test({
  name: "deploy fails when required config is missing",

  config: `
    import { service, config } from "vyft";

    export const app = service("app", {
      image: "nginx:alpine",
      env: {
        REQUIRED_VALUE: config("required-config"),
      },
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    // Don't set required-config
    try {
      await vyft.deploy();
      assert.fail("should fail when required config is missing");
    } catch (err) {
      assert(err instanceof Error);
      assert(err.message.includes("deploy failed"));
    }
  },
});

// =============================================================================
// CONFIG NAMING VALIDATION
// =============================================================================

export const configNameWithUnderscores = test({
  name: "config name can contain underscores",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.config.set("MY_CONFIG_VALUE", "test");

    const value = await vyft.config.get("MY_CONFIG_VALUE");
    assert.strictEqual(value, "test");
  },
});

export const configNameWithHyphens = test({
  name: "config name can contain hyphens",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.config.set("my-config-value", "test");

    const value = await vyft.config.get("my-config-value");
    assert.strictEqual(value, "test");
  },
});

export const configNameCaseSensitive = test({
  name: "config names are case sensitive",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.config.set("mykey", "lowercase");
    await vyft.config.set("MYKEY", "uppercase");
    await vyft.config.set("MyKey", "mixedcase");

    assert.strictEqual(await vyft.config.get("mykey"), "lowercase");
    assert.strictEqual(await vyft.config.get("MYKEY"), "uppercase");
    assert.strictEqual(await vyft.config.get("MyKey"), "mixedcase");
  },
});

// =============================================================================
// CONFIG ROTATE OPERATIONS
// =============================================================================

export const configRotateSecret = test({
  name: "config rotate regenerates secret value",

  env: {
    VYFT_PASSPHRASE: "test-passphrase-rotate",
  },

  config: `
    import { config } from "vyft";

    export const apiKey = config("api-key", { secret: true });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    // Deploy to generate initial secret
    await vyft.deploy();

    // Get initial value
    const initial = await vyft.config.get("api-key");
    assert(initial, "should have initial generated value");

    // Rotate the secret
    await vyft.config.rotate("api-key");

    // Get rotated value
    const rotated = await vyft.config.get("api-key");
    assert(rotated, "should have rotated value");
    assert.notStrictEqual(rotated, initial, "rotated value should differ");
  },
});

// =============================================================================
// CONFIG PERSISTENCE
// =============================================================================

export const configPersistsAcrossCommands = test({
  name: "config persists across multiple commands",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.config.set("PERSIST_TEST", "persisted-value");

    // Run various commands
    await vyft.config.ls();
    await vyft.stage.ls();
    await vyft.context.ls();

    // Value should still be there
    const value = await vyft.config.get("PERSIST_TEST");
    assert.strictEqual(value, "persisted-value");
  },
});

export const configPersistsAfterContextSwitch = test({
  name: "config persists after switching contexts",

  run: async ({ id, vyft }) => {
    const ctx1 = `${id}-a`;
    const ctx2 = `${id}-b`;

    await vyft.context.create(ctx1);
    await vyft.stage.create(`${id}-stg1`);
    await vyft.config.set("CTX_TEST", "original-value");

    // Switch to another context
    await vyft.context.create(ctx2);
    await vyft.stage.create(`${id}-stg2`);
    await vyft.config.set("CTX_TEST", "other-value");

    // Switch back and verify
    await vyft.context.use(ctx1);
    await vyft.stage.use(`${id}-stg1`);
    const value = await vyft.config.get("CTX_TEST");
    assert.strictEqual(value, "original-value");
  },
});
