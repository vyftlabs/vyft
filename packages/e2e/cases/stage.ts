import assert from "node:assert";
import { test } from "../src/index.ts";

export const stageCreate = test({
  name: "stage create and use",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);

    await vyft.stage.create(id);
    await vyft.stage.use(id);

    const result = await vyft.stage.ls();
    assert(result.items.includes(id));
    assert.strictEqual(result.active, id);
  },
});

export const stageLocalExists = test({
  name: "local stage always exists",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);

    const result = await vyft.stage.ls();
    assert(result.items.includes("local"));
  },
});

export const stageIsolation = test({
  name: "config values are isolated per stage",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);

    // Set value in dev stage
    await vyft.stage.create(`${id}-dev`);
    await vyft.config.set("ENV", "development");

    // Set different value in prod stage
    await vyft.stage.create(`${id}-prod`);
    await vyft.config.set("ENV", "production");

    // Switch back to dev and verify isolation
    await vyft.stage.use(`${id}-dev`);
    const devValue = await vyft.config.get("ENV");
    assert.strictEqual(devValue, "development");

    // Switch to prod and verify isolation
    await vyft.stage.use(`${id}-prod`);
    const prodValue = await vyft.config.get("ENV");
    assert.strictEqual(prodValue, "production");
  },
});
