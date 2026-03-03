import assert from "node:assert";
import { test } from "../src/index.ts";

// =============================================================================
// CONTEXT LIST OPERATIONS
// =============================================================================

export const contextLsReturnsArray = test({
  name: "context ls returns array of contexts",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);

    const result = await vyft.context.ls();
    assert(Array.isArray(result.items), "items should be an array");
    assert(result.items.includes(id), "should include created context");
  },
});

export const contextLsShowsActive = test({
  name: "context ls shows active context",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.context.use(id);

    const result = await vyft.context.ls();
    assert.strictEqual(result.active, id, "active should be the used context");
  },
});

export const contextLsEmptyInitially = test({
  name: "context ls works when no contexts exist for test",

  run: async ({ vyft }) => {
    const result = await vyft.context.ls();
    assert(Array.isArray(result.items), "items should be an array");
  },
});

// =============================================================================
// CONTEXT CREATE OPERATIONS
// =============================================================================

export const contextCreateDocker = test({
  name: "context create with docker runtime",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id, { runtime: "docker" });

    const result = await vyft.context.ls();
    assert(result.items.includes(id), "should create docker context");
  },
});

export const contextCreateKubernetes = test({
  name: "context create with kubernetes runtime",
  skip: true, // Requires kubernetes cluster

  run: async ({ id, vyft }) => {
    await vyft.context.create(id, { runtime: "kubernetes" });

    const result = await vyft.context.ls();
    assert(result.items.includes(id), "should create kubernetes context");
  },
});

export const contextCreateSwarm = test({
  name: "context create with swarm runtime",
  skip: true, // Requires swarm mode

  run: async ({ id, vyft }) => {
    await vyft.context.create(id, { runtime: "swarm" });

    const result = await vyft.context.ls();
    assert(result.items.includes(id), "should create swarm context");
  },
});

export const contextCreateDefaultsToDocker = test({
  name: "context create defaults to docker runtime",

  run: async ({ id, vyft }) => {
    // Create without specifying runtime
    await vyft.context.create(id);

    const result = await vyft.context.ls();
    assert(result.items.includes(id), "should create context with default runtime");
  },
});

export const contextCreateMultiple = test({
  name: "can create multiple contexts",

  run: async ({ id, vyft }) => {
    const ctx1 = `${id}-a`;
    const ctx2 = `${id}-b`;
    const ctx3 = `${id}-c`;

    await vyft.context.create(ctx1);
    await vyft.context.create(ctx2);
    await vyft.context.create(ctx3);

    const result = await vyft.context.ls();
    assert(result.items.includes(ctx1), "should include first context");
    assert(result.items.includes(ctx2), "should include second context");
    assert(result.items.includes(ctx3), "should include third context");
  },
});

export const contextCreateDuplicateFails = test({
  name: "context create fails for duplicate name",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);

    try {
      await vyft.context.create(id);
      assert.fail("should throw on duplicate context");
    } catch (err) {
      assert(err instanceof Error);
      assert(
        err.message.includes("context create failed"),
        "should fail with context error",
      );
    }
  },
});

// =============================================================================
// CONTEXT USE OPERATIONS
// =============================================================================

export const contextUse = test({
  name: "context use switches active context",

  run: async ({ id, vyft }) => {
    const ctx1 = `${id}-a`;
    const ctx2 = `${id}-b`;

    await vyft.context.create(ctx1);
    await vyft.context.create(ctx2);

    await vyft.context.use(ctx1);
    let result = await vyft.context.ls();
    assert.strictEqual(result.active, ctx1);

    await vyft.context.use(ctx2);
    result = await vyft.context.ls();
    assert.strictEqual(result.active, ctx2);
  },
});

export const contextUseNonexistentFails = test({
  name: "context use fails for nonexistent context",

  run: async ({ vyft }) => {
    try {
      await vyft.context.use("nonexistent-context-xyz");
      assert.fail("should throw for nonexistent context");
    } catch (err) {
      assert(err instanceof Error);
      assert(err.message.includes("context use failed"));
    }
  },
});

export const contextUsePersists = test({
  name: "context use persists across commands",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.context.use(id);

    // Run multiple ls commands to verify persistence
    let result = await vyft.context.ls();
    assert.strictEqual(result.active, id);

    result = await vyft.context.ls();
    assert.strictEqual(result.active, id);
  },
});

// =============================================================================
// CONTEXT REMOVE OPERATIONS
// =============================================================================

export const contextRm = test({
  name: "context rm removes context",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);

    let result = await vyft.context.ls();
    assert(result.items.includes(id));

    await vyft.context.rm(id);

    result = await vyft.context.ls();
    assert(!result.items.includes(id), "context should be removed");
  },
});

export const contextRmNonexistentFails = test({
  name: "context rm fails for nonexistent context",

  run: async ({ vyft }) => {
    try {
      await vyft.context.rm("nonexistent-context-xyz");
      assert.fail("should throw for nonexistent context");
    } catch (err) {
      assert(err instanceof Error);
      assert(err.message.includes("context rm failed"));
    }
  },
});

export const contextRmClearsActive = test({
  name: "context rm clears active if removed",

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.context.use(id);

    let result = await vyft.context.ls();
    assert.strictEqual(result.active, id);

    await vyft.context.rm(id);

    result = await vyft.context.ls();
    assert(result.active !== id, "active should not be removed context");
  },
});

// =============================================================================
// CONTEXT ISOLATION
// =============================================================================

export const contextIsolatesProjects = test({
  name: "contexts isolate project state",

  config: `
    import { service } from "vyft";

    export const web = service("web", {
      image: "nginx:alpine",
    });
  `,

  run: async ({ id, vyft }) => {
    const ctx1 = `${id}-a`;
    const ctx2 = `${id}-b`;

    // Create and deploy in first context
    await vyft.context.create(ctx1);
    await vyft.stage.create("test");
    await vyft.deploy();

    // Create second context - should be isolated
    await vyft.context.create(ctx2);
    await vyft.context.use(ctx2);
    await vyft.stage.create("test");

    // Preview in second context should show create (not already deployed)
    const changes = await vyft.preview();
    assert(
      changes.some((c) => c.action === "create"),
      "should show create in isolated context",
    );

    // Clean up first context
    await vyft.context.use(ctx1);
    await vyft.destroy();
  },
});

// =============================================================================
// CONTEXT NAMING VALIDATION
// =============================================================================

export const contextNameWithHyphens = test({
  name: "context name can contain hyphens",

  run: async ({ id, vyft }) => {
    const name = `my-${id}-context`;
    await vyft.context.create(name);

    const result = await vyft.context.ls();
    assert(result.items.includes(name));
  },
});

export const contextNameWithNumbers = test({
  name: "context name can contain numbers",

  run: async ({ id, vyft }) => {
    const name = `ctx123${id}`;
    await vyft.context.create(name);

    const result = await vyft.context.ls();
    assert(result.items.includes(name));
  },
});

export const contextInvalidNameFails = test({
  name: "context create fails for invalid name",

  run: async ({ vyft }) => {
    try {
      await vyft.context.create("Invalid_Name!");
      assert.fail("should fail for invalid context name");
    } catch (err) {
      assert(err instanceof Error);
      assert(err.message.includes("context create failed"));
    }
  },
});

export const contextEmptyNameFails = test({
  name: "context create fails for empty name",

  run: async ({ vyft }) => {
    try {
      await vyft.context.create("");
      assert.fail("should fail for empty context name");
    } catch (err) {
      assert(err instanceof Error);
    }
  },
});
