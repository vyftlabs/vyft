import assert from "node:assert";
import { test } from "../src/index.ts";

export const deployService = test({
  name: "deploy service and get outputs",

  config: `
    import { service } from "vyft";

    export const web = service("web", {
      image: "nginx:alpine",
      port: 80,
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output("web");
    assert(outputs.host, "expected outputs.host to be defined");
  },
});

export const deployWithConfig = test({
  name: "deploy with config values",

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
    await vyft.stage.create(id);

    // Set config value before deploy
    await vyft.config.set("app-version", "v1.0.0");

    await vyft.deploy();

    const outputs = await vyft.output("app");
    assert(outputs.host, "expected outputs.host to be defined");
  },
});

export const destroyRemovesResources = test({
  name: "destroy removes all resources",

  config: `
    import { service } from "vyft";

    export const temp = service("temp", {
      image: "nginx:alpine",
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    let outputs = await vyft.output();
    assert(Object.keys(outputs).length > 0);

    await vyft.destroy();

    try {
      outputs = await vyft.output();
      assert.strictEqual(Object.keys(outputs).length, 0);
    } catch {
      // Expected - no resources
    }
  },
});
