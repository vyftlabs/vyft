import assert from "node:assert";
import { test } from "../src/index.ts";

// =============================================================================
// INVALID SERVICE ID
// =============================================================================

export const invalidServiceIdUppercase = test({
  name: "deploy fails for uppercase service ID",

  config: `
    import { service } from "vyft";

    export const App = service("App", {
      image: "nginx:alpine",
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    try {
      await vyft.deploy();
      assert.fail("should fail for uppercase service ID");
    } catch (err) {
      assert(err instanceof Error);
      assert(err.message.includes("deploy failed"));
    }
  },
});

export const invalidServiceIdSpecialChars = test({
  name: "deploy fails for service ID with special chars",

  config: `
    import { service } from "vyft";

    export const app = service("my_app!", {
      image: "nginx:alpine",
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    try {
      await vyft.deploy();
      assert.fail("should fail for invalid service ID");
    } catch (err) {
      assert(err instanceof Error);
      assert(err.message.includes("deploy failed"));
    }
  },
});

export const invalidServiceIdStartsWithNumber = test({
  name: "deploy fails for service ID starting with number",

  config: `
    import { service } from "vyft";

    export const app = service("123app", {
      image: "nginx:alpine",
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    try {
      await vyft.deploy();
      assert.fail("should fail for ID starting with number");
    } catch (err) {
      assert(err instanceof Error);
      assert(err.message.includes("deploy failed"));
    }
  },
});

// =============================================================================
// MISSING CONFIG
// =============================================================================

export const missingRequiredConfig = test({
  name: "deploy fails for missing required config",

  config: `
    import { service, config } from "vyft";

    export const app = service("app", {
      image: "nginx:alpine",
      env: {
        REQUIRED: config("required-value"),
      },
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    // Don't set required-value
    try {
      await vyft.deploy();
      assert.fail("should fail for missing required config");
    } catch (err) {
      assert(err instanceof Error);
      assert(err.message.includes("deploy failed"));
    }
  },
});

export const missingMultipleConfigs = test({
  name: "deploy fails listing all missing configs",

  config: `
    import { service, config } from "vyft";

    export const app = service("app", {
      image: "nginx:alpine",
      env: {
        VAL1: config("missing-one"),
        VAL2: config("missing-two"),
      },
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    try {
      await vyft.deploy();
      assert.fail("should fail for missing configs");
    } catch (err) {
      assert(err instanceof Error);
      assert(err.message.includes("deploy failed"));
    }
  },
});

// =============================================================================
// INVALID CRON SCHEDULE
// =============================================================================

export const invalidCronSchedule = test({
  name: "deploy fails for invalid cron schedule",

  config: `
    import { cronjob } from "vyft";

    export const task = cronjob("task", {
      schedule: "invalid cron",
      image: "alpine:latest",
      command: "echo test",
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    try {
      await vyft.deploy();
      assert.fail("should fail for invalid cron schedule");
    } catch (err) {
      assert(err instanceof Error);
      assert(err.message.includes("deploy failed"));
    }
  },
});

export const invalidCronTooManyFields = test({
  name: "deploy fails for cron with too many fields",

  config: `
    import { cronjob } from "vyft";

    export const task = cronjob("task", {
      schedule: "* * * * * *",
      image: "alpine:latest",
      command: "echo test",
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    try {
      await vyft.deploy();
      assert.fail("should fail for invalid cron fields");
    } catch (err) {
      assert(err instanceof Error);
      assert(err.message.includes("deploy failed"));
    }
  },
});

// =============================================================================
// INVALID HEALTH CHECK
// =============================================================================

export const invalidHealthInterval = test({
  name: "deploy fails for invalid health interval",

  config: `
    import { service } from "vyft";

    export const app = service("app", {
      image: "nginx:alpine",
      health: {
        command: "true",
        interval: "invalid",
      },
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    try {
      await vyft.deploy();
      assert.fail("should fail for invalid health interval");
    } catch (err) {
      assert(err instanceof Error);
      assert(err.message.includes("deploy failed"));
    }
  },
});

// =============================================================================
// CONTEXT ERRORS
// =============================================================================

export const deployWithoutContext = test({
  name: "deploy fails without active context",

  config: `
    import { service } from "vyft";

    export const app = service("app", {
      image: "nginx:alpine",
    });
  `,

  run: async ({ vyft }) => {
    // Don't create context
    try {
      await vyft.deploy();
      assert.fail("should fail without context");
    } catch (err) {
      assert(err instanceof Error);
      assert(err.message.includes("deploy failed"));
    }
  },
});

export const contextUseInvalid = test({
  name: "context use fails for nonexistent",

  run: async ({ vyft }) => {
    try {
      await vyft.context.use("nonexistent-context-xyz123");
      assert.fail("should fail for nonexistent context");
    } catch (err) {
      assert(err instanceof Error);
      assert(err.message.includes("context use failed"));
    }
  },
});

export const contextRmInvalid = test({
  name: "context rm fails for nonexistent",

  run: async ({ vyft }) => {
    try {
      await vyft.context.rm("nonexistent-context-xyz123");
      assert.fail("should fail for nonexistent context");
    } catch (err) {
      assert(err instanceof Error);
      assert(err.message.includes("context rm failed"));
    }
  },
});

// =============================================================================
// STAGE ERRORS
// =============================================================================

export const stageUseInvalid = test({
  name: "stage use fails for nonexistent",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);

    try {
      await vyft.stage.use("nonexistent-stage-xyz123");
      assert.fail("should fail for nonexistent stage");
    } catch (err) {
      assert(err instanceof Error);
      assert(err.message.includes("stage use failed"));
    }
  },
});

export const stageRmLocal = test({
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

export const stageCreateDuplicate = test({
  name: "stage create fails for duplicate",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create("test-stage");

    try {
      await vyft.stage.create("test-stage");
      assert.fail("should fail for duplicate stage");
    } catch (err) {
      assert(err instanceof Error);
      assert(err.message.includes("stage create failed"));
    }
  },
});

// =============================================================================
// CONFIG ERRORS
// =============================================================================

export const configRmNonexistent = test({
  name: "config rm fails for nonexistent key",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    try {
      await vyft.config.rm("nonexistent-key-xyz");
      assert.fail("should fail for nonexistent key");
    } catch (err) {
      assert(err instanceof Error);
      assert(err.message.includes("config rm failed"));
    }
  },
});

// =============================================================================
// DEPLOY ERRORS
// =============================================================================

export const deployInvalidConfig = test({
  name: "deploy fails for invalid config file",

  run: async ({ id, vyft, writeConfig }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    // Write syntactically invalid config
    await writeConfig(`
      import { service } from "vyft";

      export const app = service("app" {
        // Missing comma - syntax error
        image: "nginx:alpine",
      });
    `);

    try {
      await vyft.deploy();
      assert.fail("should fail for invalid config");
    } catch (err) {
      assert(err instanceof Error);
      assert(err.message.includes("deploy failed"));
    }
  },
});

export const deployMissingImage = test({
  name: "deploy fails for service without image or build",

  config: `
    import { service } from "vyft";

    export const app = service("app", {
      port: 3000,
      // No image or build specified
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    try {
      await vyft.deploy();
      assert.fail("should fail without image or build");
    } catch (err) {
      assert(err instanceof Error);
      assert(err.message.includes("deploy failed"));
    }
  },
});

// =============================================================================
// DESTROY ERRORS
// =============================================================================

export const destroyWithoutDeploy = test({
  name: "destroy succeeds even without prior deploy",

  config: `
    import { service } from "vyft";

    export const app = service("app", {
      image: "nginx:alpine",
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    // Destroy without deploying first - should not error
    await vyft.destroy();
  },
});

// =============================================================================
// RAW COMMAND ERRORS
// =============================================================================

export const rawInvalidCommand = test({
  name: "raw command returns error for invalid subcommand",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);

    const result = await vyft.raw("invalid-subcommand");
    assert.notStrictEqual(result.code, 0, "should have non-zero exit code");
  },
});

export const rawHelpSucceeds = test({
  name: "raw help command succeeds",

  run: async ({ vyft }) => {
    const result = await vyft.raw("--help");
    assert.strictEqual(result.code, 0, "help should succeed");
    assert(result.stdout.includes("vyft") || result.stdout.includes("Usage"));
  },
});

// =============================================================================
// DUPLICATE RESOURCE IDS
// =============================================================================

export const duplicateServiceIds = test({
  name: "deploy fails for duplicate service IDs",

  config: `
    import { service } from "vyft";

    export const app1 = service("app", { image: "nginx:alpine" });
    export const app2 = service("app", { image: "nginx:alpine" });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    try {
      await vyft.deploy();
      assert.fail("should fail for duplicate IDs");
    } catch (err) {
      assert(err instanceof Error);
      assert(err.message.includes("deploy failed"));
    }
  },
});

// =============================================================================
// INVALID VOLUME ID
// =============================================================================

export const invalidVolumeId = test({
  name: "deploy fails for invalid volume ID",

  config: `
    import { service, volume } from "vyft";

    const data = volume("Invalid_Volume!");

    export const app = service("app", {
      image: "nginx:alpine",
      mounts: [{ source: data, path: "/data" }],
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    try {
      await vyft.deploy();
      assert.fail("should fail for invalid volume ID");
    } catch (err) {
      assert(err instanceof Error);
      assert(err.message.includes("deploy failed"));
    }
  },
});

// =============================================================================
// EMPTY CONFIG
// =============================================================================

export const emptyConfig = test({
  name: "deploy succeeds for empty config",

  config: `
    // No resources defined
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    // Should succeed with no resources
    await vyft.deploy();

    const outputs = await vyft.output();
    assert.strictEqual(Object.keys(outputs).length, 0);
  },
});
