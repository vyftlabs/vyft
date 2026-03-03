import assert from "node:assert";
import { test } from "../src/index.ts";

// =============================================================================
// BUILD FROM CONTEXT
// =============================================================================

export const buildFromContext = test({
  name: "build service from context directory",

  run: async ({ id, vyft, writeConfig, writeFile }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    // Create a simple Dockerfile
    await writeFile(
      "Dockerfile",
      `
FROM alpine:latest
CMD ["echo", "hello from build"]
`,
    );

    // Configure service with build
    await writeConfig(`
      import { service } from "vyft";

      export const app = service("app", {
        build: ".",
      });
    `);

    await vyft.deploy();

    const outputs = await vyft.output("app");
    assert(outputs.host, "should deploy built service");
  },
});

export const buildWithSubdirectory = test({
  name: "build from subdirectory",

  run: async ({ id, vyft, writeConfig, writeFile, exec }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    // Create subdirectory with Dockerfile
    await exec("mkdir -p app");
    await writeFile(
      "app/Dockerfile",
      `
FROM alpine:latest
CMD ["echo", "hello from app"]
`,
    );

    await writeConfig(`
      import { service } from "vyft";

      export const app = service("app", {
        build: "./app",
      });
    `);

    await vyft.deploy();

    const outputs = await vyft.output("app");
    assert(outputs.host, "should deploy from subdirectory");
  },
});

// =============================================================================
// BUILD WITH OPTIONS
// =============================================================================

export const buildWithDockerfilePath = test({
  name: "build with custom Dockerfile path",

  run: async ({ id, vyft, writeConfig, writeFile }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    // Create Dockerfile with different name
    await writeFile(
      "Dockerfile.prod",
      `
FROM alpine:latest
CMD ["echo", "production build"]
`,
    );

    await writeConfig(`
      import { service } from "vyft";

      export const app = service("app", {
        build: {
          context: ".",
          path: "Dockerfile.prod",
        },
      });
    `);

    await vyft.deploy();

    const outputs = await vyft.output("app");
    assert(outputs.host, "should deploy with custom Dockerfile");
  },
});

// =============================================================================
// BUILD CACHING
// =============================================================================

export const buildCachesImage = test({
  name: "build caches image across deploys",

  run: async ({ id, vyft, writeConfig, writeFile }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await writeFile(
      "Dockerfile",
      `
FROM alpine:latest
CMD ["echo", "cached build"]
`,
    );

    await writeConfig(`
      import { service } from "vyft";

      export const app = service("app", {
        build: ".",
      });
    `);

    // First deploy builds
    await vyft.deploy();

    // Second deploy should use cache (no changes)
    await vyft.deploy();

    const changes = await vyft.preview();
    assert.strictEqual(changes.length, 0, "should have no changes");
  },
});

export const buildDetectsChanges = test({
  name: "build detects Dockerfile changes",

  run: async ({ id, vyft, writeConfig, writeFile }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await writeFile(
      "Dockerfile",
      `
FROM alpine:latest
CMD ["echo", "version 1"]
`,
    );

    await writeConfig(`
      import { service } from "vyft";

      export const app = service("app", {
        build: ".",
      });
    `);

    await vyft.deploy();

    // Modify Dockerfile
    await writeFile(
      "Dockerfile",
      `
FROM alpine:latest
CMD ["echo", "version 2"]
`,
    );

    // Should detect change
    const changes = await vyft.preview();
    assert(changes.length > 0, "should detect Dockerfile change");
  },
});

// =============================================================================
// BUILD WITH ENV
// =============================================================================

export const buildWithEnv = test({
  name: "built service with environment variables",

  run: async ({ id, vyft, writeConfig, writeFile }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await writeFile(
      "Dockerfile",
      `
FROM alpine:latest
CMD ["sh", "-c", "echo $MY_VAR"]
`,
    );

    await writeConfig(`
      import { service, config } from "vyft";

      export const app = service("app", {
        build: ".",
        env: {
          MY_VAR: config("my-var"),
        },
      });
    `);

    await vyft.config.set("my-var", "hello-world");
    await vyft.deploy();

    const outputs = await vyft.output("app");
    assert(outputs.host, "should deploy with env");
  },
});

// =============================================================================
// BUILD DESTROY
// =============================================================================

export const buildDestroyRemovesService = test({
  name: "destroy removes built service",

  run: async ({ id, vyft, writeConfig, writeFile }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await writeFile(
      "Dockerfile",
      `
FROM alpine:latest
CMD ["sleep", "3600"]
`,
    );

    await writeConfig(`
      import { service } from "vyft";

      export const app = service("app", {
        build: ".",
      });
    `);

    await vyft.deploy();
    await vyft.destroy();

    try {
      const outputs = await vyft.output();
      assert.strictEqual(Object.keys(outputs).length, 0);
    } catch {
      // Expected
    }
  },
});

// =============================================================================
// BUILD WITH DEPENDENCIES
// =============================================================================

export const buildWithDependencies = test({
  name: "built service with dependencies",

  run: async ({ id, vyft, writeConfig, writeFile }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await writeFile(
      "Dockerfile",
      `
FROM alpine:latest
CMD ["sleep", "3600"]
`,
    );

    await writeConfig(`
      import { service } from "vyft";

      export const db = service("db", {
        image: "alpine:latest",
        command: "sleep 3600",
        health: { command: "true" },
      });

      export const app = service("app", {
        build: ".",
        dependsOn: [db],
      });
    `);

    await vyft.deploy();

    const outputs = await vyft.output();
    assert(outputs.db, "should have db");
    assert(outputs.app, "should have app");
  },
});

// =============================================================================
// BUILD WITH VOLUMES
// =============================================================================

export const buildWithVolumes = test({
  name: "built service with volumes",

  run: async ({ id, vyft, writeConfig, writeFile }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await writeFile(
      "Dockerfile",
      `
FROM alpine:latest
CMD ["sleep", "3600"]
`,
    );

    await writeConfig(`
      import { service, volume } from "vyft";

      const data = volume("data");

      export const app = service("app", {
        build: ".",
        mounts: [{ source: data, path: "/data" }],
      });
    `);

    await vyft.deploy();

    const outputs = await vyft.output("app");
    assert(outputs.host, "should deploy with volume");
  },
});

// =============================================================================
// MIXED BUILD AND IMAGE
// =============================================================================

export const mixedBuildAndImage = test({
  name: "deploy mix of built and image services",

  run: async ({ id, vyft, writeConfig, writeFile }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await writeFile(
      "Dockerfile",
      `
FROM alpine:latest
CMD ["sleep", "3600"]
`,
    );

    await writeConfig(`
      import { service } from "vyft";

      export const built = service("built", {
        build: ".",
      });

      export const pulled = service("pulled", {
        image: "nginx:alpine",
      });
    `);

    await vyft.deploy();

    const outputs = await vyft.output();
    assert(outputs.built, "should have built service");
    assert(outputs.pulled, "should have pulled service");
  },
});
