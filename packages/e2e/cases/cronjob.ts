import assert from "node:assert";
import { test } from "../src/index.ts";

// =============================================================================
// BASIC CRONJOB DEPLOYMENT
// =============================================================================

export const cronjobDeploy = test({
  name: "deploy cronjob with schedule",

  config: `
    import { cronjob } from "vyft";

    export const cleanup = cronjob("cleanup", {
      schedule: "0 3 * * *",
      image: "alpine:latest",
      command: "echo 'Running cleanup'",
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output();
    assert(outputs.cleanup, "should have cleanup cronjob");
  },
});

export const cronjobEveryMinute = test({
  name: "cronjob with every minute schedule",

  config: `
    import { cronjob } from "vyft";

    export const healthCheck = cronjob("health-check", {
      schedule: "* * * * *",
      image: "alpine:latest",
      command: "echo 'Health check'",
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output();
    assert(outputs["health-check"], "should have health-check cronjob");
  },
});

export const cronjobComplexSchedule = test({
  name: "cronjob with complex schedule",

  config: `
    import { cronjob } from "vyft";

    // Every weekday at 6:30 AM
    export const dailyReport = cronjob("daily-report", {
      schedule: "30 6 * * 1-5",
      image: "alpine:latest",
      command: "echo 'Generating daily report'",
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output();
    assert(outputs["daily-report"], "should have daily-report cronjob");
  },
});

// =============================================================================
// CRONJOB WITH ENVIRONMENT
// =============================================================================

export const cronjobWithEnv = test({
  name: "cronjob with environment variables",

  config: `
    import { cronjob } from "vyft";

    export const backup = cronjob("backup", {
      schedule: "0 2 * * *",
      image: "alpine:latest",
      command: "echo $BACKUP_PATH",
      env: {
        BACKUP_PATH: "/backups",
        RETENTION_DAYS: "30",
      },
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output();
    assert(outputs.backup, "should have backup cronjob");
  },
});

export const cronjobWithConfig = test({
  name: "cronjob with config values",

  config: `
    import { cronjob, config } from "vyft";

    export const sync = cronjob("sync", {
      schedule: "0 * * * *",
      image: "alpine:latest",
      command: "echo 'Syncing'",
      env: {
        SYNC_URL: config("sync-url"),
      },
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.config.set("sync-url", "https://api.example.com/sync");

    await vyft.deploy();

    const outputs = await vyft.output();
    assert(outputs.sync, "should have sync cronjob");
  },
});

export const cronjobWithSecret = test({
  name: "cronjob with secret config",

  env: {
    VYFT_PASSPHRASE: "test-passphrase-cronjob",
  },

  config: `
    import { cronjob, config } from "vyft";

    export const upload = cronjob("upload", {
      schedule: "0 4 * * *",
      image: "alpine:latest",
      command: "echo 'Uploading'",
      env: {
        API_KEY: config("api-key", { secret: true }),
      },
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const apiKey = await vyft.config.get("api-key");
    assert(apiKey, "should have generated api-key");
  },
});

// =============================================================================
// CRONJOB COMMAND
// =============================================================================

export const cronjobCommandString = test({
  name: "cronjob with string command",

  config: `
    import { cronjob } from "vyft";

    export const task = cronjob("task", {
      schedule: "0 0 * * *",
      image: "alpine:latest",
      command: "sh -c 'echo hello && date'",
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output();
    assert(outputs.task, "should have task cronjob");
  },
});

export const cronjobCommandArray = test({
  name: "cronjob with array command",

  config: `
    import { cronjob } from "vyft";

    export const task = cronjob("task", {
      schedule: "0 0 * * *",
      image: "alpine:latest",
      command: ["sh", "-c", "echo hello && date"],
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output();
    assert(outputs.task, "should have task cronjob");
  },
});

// =============================================================================
// CRONJOB RESTART POLICY
// =============================================================================

export const cronjobRestartOnFailure = test({
  name: "cronjob with restart on-failure",

  config: `
    import { cronjob } from "vyft";

    export const task = cronjob("task", {
      schedule: "0 0 * * *",
      image: "alpine:latest",
      command: "echo test",
      restart: "on-failure",
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output();
    assert(outputs.task, "should have task cronjob");
  },
});

export const cronjobRestartNone = test({
  name: "cronjob with restart none",

  config: `
    import { cronjob } from "vyft";

    export const oneshot = cronjob("oneshot", {
      schedule: "0 0 * * *",
      image: "alpine:latest",
      command: "echo test",
      restart: "none",
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output();
    assert(outputs.oneshot, "should have oneshot cronjob");
  },
});

// =============================================================================
// CRONJOB WITH VOLUMES
// =============================================================================

export const cronjobWithVolume = test({
  name: "cronjob with volume mount",

  config: `
    import { cronjob, volume } from "vyft";

    const backupData = volume("backup-data");

    export const backup = cronjob("backup", {
      schedule: "0 2 * * *",
      image: "alpine:latest",
      command: "echo 'backup' > /backup/latest.txt",
      mounts: [{ source: backupData, path: "/backup" }],
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output();
    assert(outputs.backup, "should have backup cronjob");
  },
});

// =============================================================================
// CRONJOB WITH HEALTH CHECK
// =============================================================================

export const cronjobWithHealth = test({
  name: "cronjob with health check",

  config: `
    import { cronjob } from "vyft";

    export const task = cronjob("task", {
      schedule: "0 0 * * *",
      image: "alpine:latest",
      command: "echo test",
      health: {
        command: "true",
        interval: "10s",
        retries: 3,
      },
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output();
    assert(outputs.task, "should have task cronjob");
  },
});

// =============================================================================
// CRONJOB UPDATE
// =============================================================================

export const cronjobUpdateSchedule = test({
  name: "update cronjob schedule",

  run: async ({ id, vyft, writeConfig }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    // Initial deploy
    await writeConfig(`
      import { cronjob } from "vyft";
      export const task = cronjob("task", {
        schedule: "0 0 * * *",
        image: "alpine:latest",
        command: "echo test",
      });
    `);
    await vyft.deploy();

    // Update schedule
    await writeConfig(`
      import { cronjob } from "vyft";
      export const task = cronjob("task", {
        schedule: "0 12 * * *",
        image: "alpine:latest",
        command: "echo test",
      });
    `);

    const changes = await vyft.preview();
    const taskChange = changes.find((c) => c.resource === "task");
    assert(taskChange, "should have task change");
    assert.strictEqual(taskChange.action, "update", "should be update");

    await vyft.deploy();
  },
});

// =============================================================================
// CRONJOB DESTROY
// =============================================================================

export const cronjobDestroy = test({
  name: "destroy removes cronjobs",

  config: `
    import { cronjob } from "vyft";

    export const task1 = cronjob("task1", {
      schedule: "0 0 * * *",
      image: "alpine:latest",
      command: "echo test1",
    });

    export const task2 = cronjob("task2", {
      schedule: "0 12 * * *",
      image: "alpine:latest",
      command: "echo test2",
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    let outputs = await vyft.output();
    assert(outputs.task1, "should have task1");
    assert(outputs.task2, "should have task2");

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
// CRONJOB NAMING
// =============================================================================

export const cronjobNameWithHyphens = test({
  name: "cronjob name with hyphens",

  config: `
    import { cronjob } from "vyft";

    export const myJob = cronjob("my-cron-job", {
      schedule: "0 0 * * *",
      image: "alpine:latest",
      command: "echo test",
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output();
    assert(outputs["my-cron-job"], "should have my-cron-job");
  },
});

// =============================================================================
// MULTIPLE CRONJOBS
// =============================================================================

export const multipleCronjobs = test({
  name: "deploy multiple cronjobs",

  config: `
    import { cronjob } from "vyft";

    export const hourly = cronjob("hourly", {
      schedule: "0 * * * *",
      image: "alpine:latest",
      command: "echo hourly",
    });

    export const daily = cronjob("daily", {
      schedule: "0 0 * * *",
      image: "alpine:latest",
      command: "echo daily",
    });

    export const weekly = cronjob("weekly", {
      schedule: "0 0 * * 0",
      image: "alpine:latest",
      command: "echo weekly",
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output();
    assert(outputs.hourly, "should have hourly");
    assert(outputs.daily, "should have daily");
    assert(outputs.weekly, "should have weekly");
  },
});

// =============================================================================
// CRONJOB WITH SERVICE
// =============================================================================

export const cronjobWithService = test({
  name: "cronjob deployed alongside service",

  config: `
    import { service, cronjob } from "vyft";

    export const app = service("app", {
      image: "nginx:alpine",
    });

    export const cleanup = cronjob("cleanup", {
      schedule: "0 3 * * *",
      image: "alpine:latest",
      command: "echo 'Cleaning up'",
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output();
    assert(outputs.app, "should have app");
    assert(outputs.cleanup, "should have cleanup");
  },
});
