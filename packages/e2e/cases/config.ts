import assert from "node:assert";
import { test } from "../src/index.ts";

export const configSetAndGet = test({
  name: "config set and get",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.config.set("DATABASE_URL", "postgres://localhost:5432/db");

    const value = await vyft.config.get("DATABASE_URL");
    assert.strictEqual(value, "postgres://localhost:5432/db");
  },
});

export const configRm = test({
  name: "config rm removes value",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.config.set("API_KEY", "test-key");
    await vyft.config.rm("API_KEY");

    const value = await vyft.config.get("API_KEY");
    assert.strictEqual(value, undefined);
  },
});

export const configLs = test({
  name: "config ls lists all values",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.config.set("FOO", "foo-value");
    await vyft.config.set("BAR", "bar-value");

    const result = await vyft.config.ls();
    const names = result.items.map((i) => i.name);

    assert(names.includes("FOO"));
    assert(names.includes("BAR"));
  },
});

export const configSecret = test({
  name: "config set --secret stores encrypted value",

  env: {
    VYFT_PASSPHRASE: "test-passphrase-12345",
  },

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.config.set("SECRET_KEY", "super-secret", { secret: true });

    const result = await vyft.config.ls();
    const secretItem = result.items.find((i) => i.name === "SECRET_KEY");

    assert(secretItem);
    assert.strictEqual(secretItem.secret, true);

    const value = await vyft.config.get("SECRET_KEY");
    assert.strictEqual(value, "super-secret");
  },
});
