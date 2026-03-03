import assert from "node:assert";
import { describe, test } from "node:test";
import { sandbox } from "../src/index.ts";

describe("errors", { concurrency: false }, () => {
  // =============================================================================
  // SERVICE ID VALIDATION
  // =============================================================================

  test("service id with uppercase fails", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const app = service("MyApp", { image: "nginx:alpine" });
  `,
    );

    try {
      await box.vyft.deploy();
      assert.fail("should have thrown");
    } catch (err) {
      assert(err instanceof Error);
      assert(err.message.includes("deploy failed"));
    }
  });

  test("service id with special chars fails", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const app = service("my_app!", { image: "nginx:alpine" });
  `,
    );

    try {
      await box.vyft.deploy();
      assert.fail("should have thrown");
    } catch (err) {
      assert(err instanceof Error);
      assert(err.message.includes("deploy failed"));
    }
  });

  test("service id starting with number fails", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const app = service("123app", { image: "nginx:alpine" });
  `,
    );

    try {
      await box.vyft.deploy();
      assert.fail("should have thrown");
    } catch (err) {
      assert(err instanceof Error);
      assert(err.message.includes("deploy failed"));
    }
  });

  // =============================================================================
  // MISSING CONFIG
  // =============================================================================

  test("missing required config fails deploy", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service, config } from "vyft";
    export const app = service("app", {
      image: "nginx:alpine",
      env: { KEY: config("required-key") },
    });
  `,
    );

    try {
      await box.vyft.deploy();
      assert.fail("should have thrown");
    } catch (err) {
      assert(err instanceof Error);
      assert(
        err.message.includes("required-key") ||
          err.message.includes("no value"),
      );
    }
  });

  // =============================================================================
  // INVALID CRON
  // =============================================================================

  test("invalid cron schedule fails", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { cronjob } from "vyft";
    export const task = cronjob("task", {
      schedule: "invalid",
      image: "alpine:latest",
      command: "echo run",
    });
  `,
    );

    try {
      await box.vyft.deploy();
      assert.fail("should have thrown");
    } catch (err) {
      assert(err instanceof Error);
      assert(err.message.includes("deploy failed"));
    }
  });

  test("cron with too many fields fails", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { cronjob } from "vyft";
    export const task = cronjob("task", {
      schedule: "0 0 * * * *",
      image: "alpine:latest",
      command: "echo run",
    });
  `,
    );

    try {
      await box.vyft.deploy();
      assert.fail("should have thrown");
    } catch (err) {
      assert(err instanceof Error);
      assert(err.message.includes("deploy failed"));
    }
  });

  // =============================================================================
  // INVALID HEALTH CHECK
  // =============================================================================

  test("invalid health interval fails", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const app = service("app", {
      image: "nginx:alpine",
      health: { command: "curl localhost", interval: "bad" },
    });
  `,
    );

    try {
      await box.vyft.deploy();
      assert.fail("should have thrown");
    } catch (err) {
      assert(err instanceof Error);
      assert(err.message.includes("deploy failed"));
    }
  });

  // =============================================================================
  // DUPLICATE IDS
  // =============================================================================

  test("duplicate service IDs fails", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const app1 = service("app", { image: "nginx:alpine" });
    export const app2 = service("app", { image: "nginx:alpine" });
  `,
    );

    try {
      await box.vyft.deploy();
      assert.fail("should have thrown");
    } catch (err) {
      assert(err instanceof Error);
      assert(
        err.message.includes("Duplicate") ||
          err.message.includes("deploy failed"),
      );
    }
  });

  // =============================================================================
  // INVALID VOLUME ID
  // =============================================================================

  test("volume id with special chars fails", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service, volume } from "vyft";
    const data = volume("data@vol");
    export const app = service("app", {
      image: "nginx:alpine",
      mounts: [{ source: data, path: "/data" }],
    });
  `,
    );

    try {
      await box.vyft.deploy();
      assert.fail("should have thrown");
    } catch (err) {
      assert(err instanceof Error);
      assert(err.message.includes("deploy failed"));
    }
  });

  // =============================================================================
  // EMPTY CONFIG
  // =============================================================================

  test("empty config deploys successfully", async () => {
    await using box = await sandbox();

    await box.fs.write("vyft.config.ts", `export default {};`);

    await box.vyft.deploy();

    // Should succeed with no resources
    const changes = await box.vyft.preview();
    assert.strictEqual(changes.length, 0);
  });

  // =============================================================================
  // INVALID CONFIG FILE
  // =============================================================================

  test("invalid config syntax fails", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const app = service("app", { image: "nginx:alpine"
    // missing closing brace
  `,
    );

    try {
      await box.vyft.deploy();
      assert.fail("should have thrown");
    } catch (err) {
      assert(err instanceof Error);
      assert(err.message.includes("deploy failed"));
    }
  });

  // =============================================================================
  // DESTROY WITHOUT DEPLOY
  // =============================================================================

  test("destroy without prior deploy succeeds", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const app = service("app", { image: "nginx:alpine" });
  `,
    );

    // Should not throw
    await box.vyft.destroy();
  });

  // =============================================================================
  // RAW COMMAND ERRORS
  // =============================================================================

  test("invalid vyft command fails", async () => {
    await using box = await sandbox();

    await box.fs.write("vyft.config.ts", `export default {};`);

    const result = await box.vyft.raw("nonexistent-command");
    assert(result.code !== 0, "should fail");
  });

  test("vyft help succeeds", async () => {
    await using box = await sandbox();

    await box.fs.write("vyft.config.ts", `export default {};`);

    const result = await box.vyft.raw("--help");
    assert.strictEqual(result.code, 0, "help should succeed");
  });
});
