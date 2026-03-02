import assert from "node:assert";
import { test } from "../src/index.ts";

export const contextLs = test({
  name: "context ls returns list",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);

    const result = await vyft.context.ls();
    assert(Array.isArray(result.items));
    assert(result.items.includes(id));
  },
});

export const contextCreate = test({
  name: "context create and use",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id, { runtime: "docker" });
    await vyft.context.use(id);

    const result = await vyft.context.ls();
    assert(result.items.includes(id));
    assert.strictEqual(result.active, id);
  },
});
