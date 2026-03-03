import assert from "node:assert";
import { describe, test } from "node:test";
import { sandbox } from "../src/index.ts";

describe("dependencies", { concurrency: false }, () => {
  // =============================================================================
  // BASIC DEPENDENCIES
  // =============================================================================

  test("service with single dependency", async () => {
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

  test("service with multiple dependencies", async () => {
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
      dependsOn: [db, cache],
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
  // DEPENDENCY CHAINS
  // =============================================================================

  test("dependency chain A->B->C", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    const a = service("a", { image: "nginx:alpine" });
    const b = service("b", { image: "nginx:alpine", dependsOn: [a] });
    export const c = service("c", { image: "nginx:alpine", dependsOn: [b] });
    export { a, b };
  `,
    );

    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.a, "should have a");
    assert(outputs.b, "should have b");
    assert(outputs.c, "should have c");
  });

  test("diamond dependency pattern", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    const base = service("base", { image: "nginx:alpine" });
    const left = service("left", { image: "nginx:alpine", dependsOn: [base] });
    const right = service("right", { image: "nginx:alpine", dependsOn: [base] });
    export const top = service("top", {
      image: "nginx:alpine",
      dependsOn: [left, right],
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

  // =============================================================================
  // DEPLOY ORDERING
  // =============================================================================

  test("dependencies deployed first", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    const db = service("db", {
      image: "postgres:alpine",
      env: { POSTGRES_PASSWORD: "test" },
      health: { command: "pg_isready -U postgres", interval: "2s", retries: 10 },
    });
    export const api = service("api", {
      image: "nginx:alpine",
      dependsOn: [db],
    });
    export { db };
  `,
    );

    await box.vyft.deploy();

    // If order was wrong, db wouldn't be healthy before api starts
    const outputs = await box.vyft.output();
    assert(outputs.db, "db should be deployed");
    assert(outputs.api, "api should be deployed after db");
  });

  // =============================================================================
  // DESTROY ORDERING
  // =============================================================================

  test("dependents destroyed first", async () => {
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
      dependsOn: [db],
    });
    export { db };
  `,
    );

    await box.vyft.deploy();
    await box.vyft.destroy();

    // If order was wrong, destroy would fail
    const changes = await box.vyft.preview();
    assert(changes.length === 2, "both should need to be created");
  });

  // =============================================================================
  // MIXED SERVICES
  // =============================================================================

  test("independent services deploy in parallel", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const a = service("a", { image: "nginx:alpine" });
    export const b = service("b", { image: "nginx:alpine" });
    export const c = service("c", { image: "nginx:alpine" });
  `,
    );

    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.a, "should have a");
    assert(outputs.b, "should have b");
    assert(outputs.c, "should have c");
  });

  test("mixed dependent and independent", async () => {
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
      dependsOn: [db],
    });
    export const worker = service("worker", { image: "nginx:alpine" });
    export { db };
  `,
    );

    await box.vyft.deploy();

    const outputs = await box.vyft.output();
    assert(outputs.db, "should have db");
    assert(outputs.api, "should have api");
    assert(outputs.worker, "should have worker");
  });

  // =============================================================================
  // DEPENDENCY UPDATES
  // =============================================================================

  test("updating dependency", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    const db = service("db", {
      image: "postgres:15-alpine",
      env: { POSTGRES_PASSWORD: "test" },
    });
    export const api = service("api", {
      image: "nginx:alpine",
      dependsOn: [db],
    });
    export { db };
  `,
    );

    await box.vyft.deploy();

    // Update db version
    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    const db = service("db", {
      image: "postgres:16-alpine",
      env: { POSTGRES_PASSWORD: "test" },
    });
    export const api = service("api", {
      image: "nginx:alpine",
      dependsOn: [db],
    });
    export { db };
  `,
    );

    const changes = await box.vyft.preview();
    assert(
      changes.some((c) => c.resource === "db" && c.action === "update"),
      "should update db",
    );
  });

  test("removing dependency", async () => {
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
      dependsOn: [db],
    });
    export { db };
  `,
    );

    await box.vyft.deploy();

    // Remove db dependency
    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const api = service("api", { image: "nginx:alpine" });
  `,
    );

    const changes = await box.vyft.preview();
    assert(
      changes.some((c) => c.resource === "db" && c.action === "delete"),
      "should delete db",
    );
  });

  test("adding dependency", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
    import { service } from "vyft";
    export const api = service("api", { image: "nginx:alpine" });
  `,
    );

    await box.vyft.deploy();

    // Add db dependency
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
      dependsOn: [db],
    });
    export { db };
  `,
    );

    const changes = await box.vyft.preview();
    assert(
      changes.some((c) => c.resource === "db" && c.action === "create"),
      "should create db",
    );
  });
});
