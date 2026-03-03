import assert from "node:assert";
import { test } from "../src/index.ts";

// =============================================================================
// BASIC VOLUME OPERATIONS
// =============================================================================

export const volumeCreate = test({
  name: "volume is created with service",

  config: `
    import { service, volume } from "vyft";

    const data = volume("data");

    export const app = service("app", {
      image: "nginx:alpine",
      mounts: [{ source: data, path: "/data" }],
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output("app");
    assert(outputs.host, "should deploy successfully");
  },
});

export const volumeWithSize = test({
  name: "volume with size hint",

  config: `
    import { service, volume } from "vyft";

    const data = volume("data", { size: "10Gi" });

    export const app = service("app", {
      image: "nginx:alpine",
      mounts: [{ source: data, path: "/data" }],
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output("app");
    assert(outputs.host, "should deploy successfully");
  },
});

// =============================================================================
// VOLUME MOUNTING
// =============================================================================

export const volumeSingleMount = test({
  name: "volume mounted to single service",

  config: `
    import { service, volume } from "vyft";

    const uploads = volume("uploads");

    export const web = service("web", {
      image: "nginx:alpine",
      mounts: [{ source: uploads, path: "/var/www/uploads" }],
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output("web");
    assert(outputs.host, "should deploy successfully");
  },
});

export const volumeMultipleMounts = test({
  name: "multiple volumes on single service",

  config: `
    import { service, volume } from "vyft";

    const data = volume("data");
    const logs = volume("logs");
    const cache = volume("cache");

    export const app = service("app", {
      image: "nginx:alpine",
      mounts: [
        { source: data, path: "/data" },
        { source: logs, path: "/var/log/app" },
        { source: cache, path: "/cache" },
      ],
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output("app");
    assert(outputs.host, "should deploy successfully");
  },
});

export const volumeSharedBetweenServices = test({
  name: "volume shared between services",

  config: `
    import { service, volume } from "vyft";

    const shared = volume("shared");

    export const writer = service("writer", {
      image: "alpine:latest",
      command: "while true; do date >> /shared/log.txt; sleep 10; done",
      mounts: [{ source: shared, path: "/shared" }],
    });

    export const reader = service("reader", {
      image: "nginx:alpine",
      mounts: [{ source: shared, path: "/usr/share/nginx/html" }],
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output();
    assert(outputs.writer, "should have writer");
    assert(outputs.reader, "should have reader");
  },
});

// =============================================================================
// VOLUME PERSISTENCE
// =============================================================================

export const volumePersistsAcrossRedeploy = test({
  name: "volume data persists across redeploy",

  config: `
    import { service, volume, config } from "vyft";

    const data = volume("data");

    export const app = service("app", {
      image: "nginx:alpine",
      mounts: [{ source: data, path: "/data" }],
      env: {
        VERSION: config("version"),
      },
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    // First deploy
    await vyft.config.set("version", "v1");
    await vyft.deploy();

    // Update and redeploy
    await vyft.config.set("version", "v2");
    await vyft.deploy();

    // Volume should still exist
    const outputs = await vyft.output("app");
    assert(outputs.host, "should still be deployed");
  },
});

// =============================================================================
// VOLUME DESTROY
// =============================================================================

export const volumeDestroyedWithService = test({
  name: "volume destroyed with service",

  config: `
    import { service, volume } from "vyft";

    const data = volume("data");

    export const app = service("app", {
      image: "nginx:alpine",
      mounts: [{ source: data, path: "/data" }],
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();
    await vyft.destroy();

    try {
      const outputs = await vyft.output();
      assert.strictEqual(Object.keys(outputs).length, 0);
    } catch {
      // Expected - no resources
    }
  },
});

// =============================================================================
// VOLUME NAMING
// =============================================================================

export const volumeNameWithHyphens = test({
  name: "volume name with hyphens",

  config: `
    import { service, volume } from "vyft";

    const myVolume = volume("my-data-volume");

    export const app = service("app", {
      image: "nginx:alpine",
      mounts: [{ source: myVolume, path: "/data" }],
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output("app");
    assert(outputs.host, "should deploy successfully");
  },
});

export const volumeNameWithNumbers = test({
  name: "volume name with numbers",

  config: `
    import { service, volume } from "vyft";

    const vol = volume("data-v2");

    export const app = service("app", {
      image: "nginx:alpine",
      mounts: [{ source: vol, path: "/data" }],
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output("app");
    assert(outputs.host, "should deploy successfully");
  },
});

// =============================================================================
// BIND MOUNTS
// =============================================================================

export const bindMountCreate = test({
  name: "bind mount for host path",

  config: `
    import { service, bind } from "vyft";

    const hostPath = bind("config", "/tmp/test-config");

    export const app = service("app", {
      image: "nginx:alpine",
      mounts: [{ source: hostPath, path: "/config" }],
    });
  `,

  run: async ({ id, vyft, exec }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    // Create the host directory
    await exec("mkdir -p /tmp/test-config");

    await vyft.deploy();

    const outputs = await vyft.output("app");
    assert(outputs.host, "should deploy successfully");
  },
});

// =============================================================================
// VOLUME WITH DEPENDENCIES
// =============================================================================

export const volumeWithDependentServices = test({
  name: "volume with dependent services",

  config: `
    import { service, volume } from "vyft";

    const dbData = volume("db-data");

    export const db = service("db", {
      image: "postgres:alpine",
      env: {
        POSTGRES_PASSWORD: "test",
      },
      mounts: [{ source: dbData, path: "/var/lib/postgresql/data" }],
      health: {
        command: "pg_isready -U postgres",
        interval: "5s",
        retries: 10,
      },
    });

    export const app = service("app", {
      image: "nginx:alpine",
      dependsOn: [db],
    });
  `,

  timeout: 180_000,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output();
    assert(outputs.db, "should have db");
    assert(outputs.app, "should have app");
  },
});
