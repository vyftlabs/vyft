import assert from "node:assert";
import { describe, test } from "node:test";
import { sandbox } from "../src/index.ts";

describe("cronjob", { concurrency: false }, () => {
  // =============================================================================
  // BASIC CRONJOB
  // =============================================================================

  test("deploy cronjob with schedule", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { cronjob } from "vyft";
    export const cleanup = cronjob("cleanup", {
      schedule: "0 0 * * *",
      image: "alpine:latest",
      command: "echo cleanup",
    });
  `,
    );

    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.cleanup, "should deploy cronjob");
  });

  test("deploy cronjob every minute", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { cronjob } from "vyft";
    export const task = cronjob("task", {
      schedule: "* * * * *",
      image: "alpine:latest",
      command: "echo tick",
    });
  `,
    );

    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.task, "should deploy every-minute cronjob");
  });

  test("deploy cronjob with complex schedule", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { cronjob } from "vyft";
    export const task = cronjob("task", {
      schedule: "0 9-17 * * 1-5",
      image: "alpine:latest",
      command: "echo work-hours",
    });
  `,
    );

    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.task, "should deploy complex-schedule cronjob");
  });

  // =============================================================================
  // CRONJOB WITH ENV
  // =============================================================================

  test("cronjob with env vars", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { cronjob } from "vyft";
    export const task = cronjob("task", {
      schedule: "0 0 * * *",
      image: "alpine:latest",
      command: "echo $MESSAGE",
      env: { MESSAGE: "hello" },
    });
  `,
    );

    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.task, "should deploy cronjob with env");
  });

  test("cronjob with config value", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { cronjob, config } from "vyft";
    export const task = cronjob("task", {
      schedule: "0 0 * * *",
      image: "alpine:latest",
      command: "echo run",
      env: { API_KEY: config("api-key") },
    });
  `,
    );

    await box.vyft.config.set("api-key", "secret");
    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.task, "should deploy cronjob with config");
  });

  test("cronjob with secret", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { cronjob, config } from "vyft";
    export const task = cronjob("task", {
      schedule: "0 0 * * *",
      image: "alpine:latest",
      command: "echo run",
      env: { SECRET: config("secret", { secret: true }) },
    });
  `,
    );

    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.task, "should deploy cronjob with secret");
  });

  // =============================================================================
  // CRONJOB COMMAND
  // =============================================================================

  test("cronjob with string command", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { cronjob } from "vyft";
    export const task = cronjob("task", {
      schedule: "0 0 * * *",
      image: "alpine:latest",
      command: "echo hello && sleep 1",
    });
  `,
    );

    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.task, "should deploy with string command");
  });

  test("cronjob with array command", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { cronjob } from "vyft";
    export const task = cronjob("task", {
      schedule: "0 0 * * *",
      image: "alpine:latest",
      command: ["sh", "-c", "echo hello"],
    });
  `,
    );

    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.task, "should deploy with array command");
  });

  // =============================================================================
  // CRONJOB RESTART
  // =============================================================================

  test("cronjob with restart on-failure", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { cronjob } from "vyft";
    export const task = cronjob("task", {
      schedule: "0 0 * * *",
      image: "alpine:latest",
      command: "echo run",
      restart: "on-failure",
    });
  `,
    );

    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.task, "should deploy with on-failure restart");
  });

  test("cronjob with restart none", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { cronjob } from "vyft";
    export const task = cronjob("task", {
      schedule: "0 0 * * *",
      image: "alpine:latest",
      command: "echo run",
      restart: "none",
    });
  `,
    );

    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.task, "should deploy with no restart");
  });

  // =============================================================================
  // CRONJOB WITH VOLUME
  // =============================================================================

  test("cronjob with volume mount", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { cronjob, volume } from "vyft";
    const data = volume("data");
    export const task = cronjob("task", {
      schedule: "0 0 * * *",
      image: "alpine:latest",
      command: "echo data > /data/output",
      mounts: [{ source: data, path: "/data" }],
    });
  `,
    );

    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.task, "should deploy with volume");
  });

  // =============================================================================
  // CRONJOB UPDATE
  // =============================================================================

  test("cronjob schedule change triggers update", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { cronjob } from "vyft";
    export const task = cronjob("task", {
      schedule: "0 0 * * *",
      image: "alpine:latest",
      command: "echo run",
    });
  `,
    );

    await box.vyft.deploy();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { cronjob } from "vyft";
    export const task = cronjob("task", {
      schedule: "0 6 * * *",
      image: "alpine:latest",
      command: "echo run",
    });
  `,
    );

    const changes = await box.vyft.preview();
    assert(
      changes.some((c) => c.resource === "task" && c.action === "update"),
      "should detect schedule change",
    );
  });

  // =============================================================================
  // CRONJOB DESTROY
  // =============================================================================

  test("cronjob destroy", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { cronjob } from "vyft";
    export const task = cronjob("task", {
      schedule: "0 0 * * *",
      image: "alpine:latest",
      command: "echo run",
    });
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

  // =============================================================================
  // CRONJOB NAMING
  // =============================================================================

  test("cronjob name with hyphens", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { cronjob } from "vyft";
    export const task = cronjob("my-cleanup-job", {
      schedule: "0 0 * * *",
      image: "alpine:latest",
      command: "echo run",
    });
  `,
    );

    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs["my-cleanup-job"], "should deploy with hyphenated name");
  });

  // =============================================================================
  // MULTIPLE CRONJOBS
  // =============================================================================

  test("deploy multiple cronjobs", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { cronjob } from "vyft";
    export const daily = cronjob("daily", {
      schedule: "0 0 * * *",
      image: "alpine:latest",
      command: "echo daily",
    });
    export const hourly = cronjob("hourly", {
      schedule: "0 * * * *",
      image: "alpine:latest",
      command: "echo hourly",
    });
  `,
    );

    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.daily, "should have daily");
    assert(outputs.hourly, "should have hourly");
  });

  // =============================================================================
  // CRONJOB WITH SERVICE
  // =============================================================================

  test("cronjob alongside service", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service, cronjob } from "vyft";
    export const app = service("app", { image: "nginx:alpine" });
    export const cleanup = cronjob("cleanup", {
      schedule: "0 0 * * *",
      image: "alpine:latest",
      command: "echo cleanup",
    });
  `,
    );

    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.app, "should have app");
    assert(outputs.cleanup, "should have cleanup");
  });
});
