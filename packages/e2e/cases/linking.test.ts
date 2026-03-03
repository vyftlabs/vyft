import assert from "node:assert";
import { describe, test } from "node:test";
import { sandbox } from "../src/index.ts";

describe("linking", { concurrency: false }, () => {
  // =============================================================================
  // BASIC LINKING
  // =============================================================================

  test("link to single service", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    const db = service("db", {
      image: "postgres:alpine",
      env: { POSTGRES_PASSWORD: "test" },
    });
    export const api = service("api", {
      image: "nginx:alpine",
      link: [db],
    });
    export { db };
  `,
    );

    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.db, "should have db");
    assert(outputs.api, "should have api");
  });

  test("link to multiple services", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    const db = service("db", {
      image: "postgres:alpine",
      env: { POSTGRES_PASSWORD: "test" },
    });
    const cache = service("cache", { image: "redis:alpine" });
    export const api = service("api", {
      image: "nginx:alpine",
      link: [db, cache],
    });
    export { db, cache };
  `,
    );

    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.db, "should have db");
    assert(outputs.cache, "should have cache");
    assert(outputs.api, "should have api");
  });

  // =============================================================================
  // LINK WITH DEPENDENCIES
  // =============================================================================

  test("link with dependsOn", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    const db = service("db", {
      image: "postgres:alpine",
      env: { POSTGRES_PASSWORD: "test" },
    });
    export const api = service("api", {
      image: "nginx:alpine",
      link: [db],
      dependsOn: [db],
    });
    export { db };
  `,
    );

    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.db, "should have db");
    assert(outputs.api, "should have api");
  });

  // =============================================================================
  // CRONJOB LINKING
  // =============================================================================

  test("cronjob linked to service", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service, cronjob } from "vyft";
    const db = service("db", {
      image: "postgres:alpine",
      env: { POSTGRES_PASSWORD: "test" },
    });
    export const backup = cronjob("backup", {
      schedule: "0 0 * * *",
      image: "alpine:latest",
      command: "echo backup",
      link: [db],
    });
    export { db };
  `,
    );

    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.db, "should have db");
    assert(outputs.backup, "should have backup");
  });

  // =============================================================================
  // CHAINED LINKS
  // =============================================================================

  test("chained links A->B->C", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    const a = service("a", { image: "nginx:alpine" });
    const b = service("b", { image: "nginx:alpine", link: [a] });
    export const c = service("c", { image: "nginx:alpine", link: [b] });
    export { a, b };
  `,
    );

    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.a, "should have a");
    assert(outputs.b, "should have b");
    assert(outputs.c, "should have c");
  });

  // =============================================================================
  // LINK UPDATES
  // =============================================================================

  test("adding link triggers update", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const db = service("db", {
      image: "postgres:alpine",
      env: { POSTGRES_PASSWORD: "test" },
    });
    export const api = service("api", { image: "nginx:alpine" });
  `,
    );

    await box.vyft.deploy();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    const db = service("db", {
      image: "postgres:alpine",
      env: { POSTGRES_PASSWORD: "test" },
    });
    export const api = service("api", {
      image: "nginx:alpine",
      link: [db],
    });
    export { db };
  `,
    );

    const changes = await box.vyft.preview();
    assert(
      changes.some((c) => c.resource === "api" && c.action === "update"),
      "should update api when link added",
    );
  });

  test("removing link triggers update", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    const db = service("db", {
      image: "postgres:alpine",
      env: { POSTGRES_PASSWORD: "test" },
    });
    export const api = service("api", {
      image: "nginx:alpine",
      link: [db],
    });
    export { db };
  `,
    );

    await box.vyft.deploy();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const db = service("db", {
      image: "postgres:alpine",
      env: { POSTGRES_PASSWORD: "test" },
    });
    export const api = service("api", { image: "nginx:alpine" });
  `,
    );

    const changes = await box.vyft.preview();
    assert(
      changes.some((c) => c.resource === "api" && c.action === "update"),
      "should update api when link removed",
    );
  });

  // =============================================================================
  // LINK DESTROY
  // =============================================================================

  test("linked services destroyed correctly", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    const db = service("db", {
      image: "postgres:alpine",
      env: { POSTGRES_PASSWORD: "test" },
    });
    export const api = service("api", {
      image: "nginx:alpine",
      link: [db],
    });
    export { db };
  `,
    );

    await box.vyft.deploy();
    await box.vyft.destroy();

    const changes = await box.vyft.preview();
    assert.strictEqual(changes.length, 2, "both should need to be created");
  });

  // =============================================================================
  // DIAMOND LINK PATTERN
  // =============================================================================

  test("diamond link pattern", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    const base = service("base", { image: "nginx:alpine" });
    const left = service("left", { image: "nginx:alpine", link: [base] });
    const right = service("right", { image: "nginx:alpine", link: [base] });
    export const top = service("top", {
      image: "nginx:alpine",
      link: [left, right],
    });
    export { base, left, right };
  `,
    );

    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.base, "should have base");
    assert(outputs.left, "should have left");
    assert(outputs.right, "should have right");
    assert(outputs.top, "should have top");
  });
});
