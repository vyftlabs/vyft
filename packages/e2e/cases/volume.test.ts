import assert from "node:assert";
import { describe, test } from "node:test";
import { sandbox } from "../src/index.ts";

describe("volume", { concurrency: false }, () => {
  // =============================================================================
  // BASIC VOLUME
  // =============================================================================

  test("volume created with service", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service, volume } from "vyft";
    const data = volume("data");
    export const app = service("app", {
      image: "nginx:alpine",
      mounts: [{ source: data, path: "/data" }],
    });
  `,
    );

    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.app, "should deploy with volume");
  });

  test("volume with size hint", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service, volume } from "vyft";
    const data = volume("data", { size: "10Gi" });
    export const app = service("app", {
      image: "nginx:alpine",
      mounts: [{ source: data, path: "/data" }],
    });
  `,
    );

    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.app, "should deploy with sized volume");
  });

  // =============================================================================
  // MULTIPLE VOLUMES
  // =============================================================================

  test("multiple volumes on service", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service, volume } from "vyft";
    const data = volume("data");
    const logs = volume("logs");
    export const app = service("app", {
      image: "nginx:alpine",
      mounts: [
        { source: data, path: "/data" },
        { source: logs, path: "/logs" },
      ],
    });
  `,
    );

    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.app, "should deploy with multiple volumes");
  });

  test("volume shared between services", { timeout: 120_000 }, async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service, volume } from "vyft";
    const shared = volume("shared");
    export const writer = service("writer", {
      image: "alpine:latest",
      command: "sh -c 'echo hello > /shared/file && sleep 3600'",
      mounts: [{ source: shared, path: "/shared" }],
    });
    export const reader = service("reader", {
      image: "alpine:latest",
      command: "sleep 3600",
      mounts: [{ source: shared, path: "/shared" }],
    });
  `,
    );

    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.writer, "should have writer");
    assert(outputs.reader, "should have reader");
  });

  // =============================================================================
  // BIND MOUNT
  // =============================================================================

  test("bind mount for host path", async () => {
    await using box = await sandbox();

    // Create host directory
    await box.fs.write("host-data/file.txt", "hello");

    // Use absolute path for bind mount
    await box.fs.write(
      "vyft.config.ts",
      `
    import { service, bind } from "vyft";
    const hostData = bind("host-data", "${box.tmpDir}/host-data");
    export const app = service("app", {
      image: "nginx:alpine",
      mounts: [{ source: hostData, path: "/data" }],
    });
  `,
    );

    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.app, "should deploy with bind mount");
  });

  // =============================================================================
  // VOLUME PERSISTENCE
  // =============================================================================

  test("volume data persists across redeploy", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service, volume } from "vyft";
    const data = volume("data");
    export const app = service("app", {
      image: "alpine:latest",
      command: "sh -c 'echo persistent > /data/file && sleep 3600'",
      mounts: [{ source: data, path: "/data" }],
    });
  `,
    );

    await box.vyft.deploy();

    // Redeploy
    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.app, "should redeploy with persistent volume");
  });

  // =============================================================================
  // VOLUME DESTROY
  // =============================================================================

  test("volume destroyed with service", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service, volume } from "vyft";
    const data = volume("data");
    export const app = service("app", {
      image: "nginx:alpine",
      mounts: [{ source: data, path: "/data" }],
    });
  `,
    );

    await box.vyft.deploy();
    await box.vyft.destroy();

    const changes = await box.vyft.preview();
    assert(changes.length > 0, "should show creates after destroy");
  });

  // =============================================================================
  // VOLUME NAMING
  // =============================================================================

  test("volume name with hyphens", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service, volume } from "vyft";
    const data = volume("my-data-vol");
    export const app = service("app", {
      image: "nginx:alpine",
      mounts: [{ source: data, path: "/data" }],
    });
  `,
    );

    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.app, "should deploy with hyphenated volume name");
  });

  test("volume name with numbers", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service, volume } from "vyft";
    const data = volume("data123");
    export const app = service("app", {
      image: "nginx:alpine",
      mounts: [{ source: data, path: "/data" }],
    });
  `,
    );

    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.app, "should deploy with numeric volume name");
  });
});
