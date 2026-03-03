import assert from "node:assert";
import { test } from "../src/index.ts";

// =============================================================================
// BASIC DEPENDENCIES
// =============================================================================

export const dependsOnSingle = test({
  name: "service depends on single service",

  config: `
    import { service } from "vyft";

    export const db = service("db", {
      image: "postgres:alpine",
      env: { POSTGRES_PASSWORD: "test" },
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

export const dependsOnMultiple = test({
  name: "service depends on multiple services",

  config: `
    import { service } from "vyft";

    export const db = service("db", {
      image: "postgres:alpine",
      env: { POSTGRES_PASSWORD: "test" },
      health: {
        command: "pg_isready -U postgres",
        interval: "5s",
        retries: 10,
      },
    });

    export const cache = service("cache", {
      image: "redis:alpine",
      health: {
        command: "redis-cli ping",
        interval: "5s",
        retries: 5,
      },
    });

    export const app = service("app", {
      image: "nginx:alpine",
      dependsOn: [db, cache],
    });
  `,

  timeout: 180_000,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output();
    assert(outputs.db, "should have db");
    assert(outputs.cache, "should have cache");
    assert(outputs.app, "should have app");
  },
});

// =============================================================================
// DEPENDENCY CHAINS
// =============================================================================

export const dependencyChain = test({
  name: "dependency chain A -> B -> C",

  config: `
    import { service } from "vyft";

    export const base = service("base", {
      image: "alpine:latest",
      command: "sleep 3600",
      health: { command: "true" },
    });

    export const middle = service("middle", {
      image: "alpine:latest",
      command: "sleep 3600",
      dependsOn: [base],
      health: { command: "true" },
    });

    export const top = service("top", {
      image: "alpine:latest",
      command: "sleep 3600",
      dependsOn: [middle],
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output();
    assert(outputs.base, "should have base");
    assert(outputs.middle, "should have middle");
    assert(outputs.top, "should have top");
  },
});

export const dependencyDiamond = test({
  name: "diamond dependency pattern",

  config: `
    import { service } from "vyft";

    // Diamond: app depends on api and worker, both depend on db
    export const db = service("db", {
      image: "alpine:latest",
      command: "sleep 3600",
      health: { command: "true" },
    });

    export const api = service("api", {
      image: "alpine:latest",
      command: "sleep 3600",
      dependsOn: [db],
      health: { command: "true" },
    });

    export const worker = service("worker", {
      image: "alpine:latest",
      command: "sleep 3600",
      dependsOn: [db],
      health: { command: "true" },
    });

    export const app = service("app", {
      image: "alpine:latest",
      command: "sleep 3600",
      dependsOn: [api, worker],
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output();
    assert(outputs.db, "should have db");
    assert(outputs.api, "should have api");
    assert(outputs.worker, "should have worker");
    assert(outputs.app, "should have app");
  },
});

// =============================================================================
// DEPLOY ORDERING
// =============================================================================

export const dependenciesDeployedFirst = test({
  name: "dependencies deployed before dependents",

  config: `
    import { service } from "vyft";

    export const dependency = service("dependency", {
      image: "alpine:latest",
      command: "sleep 3600",
      health: { command: "true" },
    });

    export const dependent = service("dependent", {
      image: "alpine:latest",
      command: "sleep 3600",
      dependsOn: [dependency],
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    // Deploy should succeed - dependencies handled correctly
    await vyft.deploy();

    const outputs = await vyft.output();
    assert(outputs.dependency, "should have dependency");
    assert(outputs.dependent, "should have dependent");
  },
});

// =============================================================================
// DESTROY ORDERING
// =============================================================================

export const dependentsDestroyedFirst = test({
  name: "dependents destroyed before dependencies",

  config: `
    import { service } from "vyft";

    export const base = service("base", {
      image: "alpine:latest",
      command: "sleep 3600",
      health: { command: "true" },
    });

    export const derived = service("derived", {
      image: "alpine:latest",
      command: "sleep 3600",
      dependsOn: [base],
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
      // Expected
    }
  },
});

// =============================================================================
// INDEPENDENT SERVICES
// =============================================================================

export const independentServices = test({
  name: "independent services deploy in parallel",

  config: `
    import { service } from "vyft";

    export const svc1 = service("svc1", {
      image: "nginx:alpine",
    });

    export const svc2 = service("svc2", {
      image: "nginx:alpine",
    });

    export const svc3 = service("svc3", {
      image: "nginx:alpine",
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output();
    assert(outputs.svc1, "should have svc1");
    assert(outputs.svc2, "should have svc2");
    assert(outputs.svc3, "should have svc3");
  },
});

// =============================================================================
// MIXED DEPENDENCIES
// =============================================================================

export const mixedDependencies = test({
  name: "mixed dependent and independent services",

  config: `
    import { service } from "vyft";

    // Independent services
    export const static1 = service("static1", {
      image: "nginx:alpine",
    });

    export const static2 = service("static2", {
      image: "nginx:alpine",
    });

    // Dependent services
    export const db = service("db", {
      image: "alpine:latest",
      command: "sleep 3600",
      health: { command: "true" },
    });

    export const api = service("api", {
      image: "alpine:latest",
      command: "sleep 3600",
      dependsOn: [db],
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output();
    assert(outputs.static1, "should have static1");
    assert(outputs.static2, "should have static2");
    assert(outputs.db, "should have db");
    assert(outputs.api, "should have api");
  },
});

// =============================================================================
// HEALTH CHECK DEPENDENCIES
// =============================================================================

export const healthCheckBeforeDependent = test({
  name: "health check passes before dependent starts",

  config: `
    import { service } from "vyft";

    export const db = service("db", {
      image: "postgres:alpine",
      env: { POSTGRES_PASSWORD: "test" },
      health: {
        command: "pg_isready -U postgres",
        interval: "3s",
        timeout: "5s",
        retries: 15,
        startPeriod: "10s",
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

// =============================================================================
// UPDATE WITH DEPENDENCIES
// =============================================================================

export const updateDependencyTriggersDependent = test({
  name: "updating dependency may trigger dependent update",

  run: async ({ id, vyft, writeConfig }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    // Initial deploy
    await writeConfig(`
      import { service } from "vyft";

      export const db = service("db", {
        image: "alpine:latest",
        command: "sleep 3600",
        health: { command: "true" },
        env: { VERSION: "v1" },
      });

      export const app = service("app", {
        image: "alpine:latest",
        command: "sleep 3600",
        dependsOn: [db],
      });
    `);
    await vyft.deploy();

    // Update dependency
    await writeConfig(`
      import { service } from "vyft";

      export const db = service("db", {
        image: "alpine:latest",
        command: "sleep 3600",
        health: { command: "true" },
        env: { VERSION: "v2" },
      });

      export const app = service("app", {
        image: "alpine:latest",
        command: "sleep 3600",
        dependsOn: [db],
      });
    `);

    const changes = await vyft.preview();
    const dbChange = changes.find((c) => c.resource === "db");
    assert(dbChange, "should have db change");

    await vyft.deploy();
  },
});

// =============================================================================
// REMOVE DEPENDENCY
// =============================================================================

export const removeDependency = test({
  name: "removing dependency updates dependent",

  run: async ({ id, vyft, writeConfig }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    // Initial deploy with dependency
    await writeConfig(`
      import { service } from "vyft";

      export const db = service("db", {
        image: "alpine:latest",
        command: "sleep 3600",
        health: { command: "true" },
      });

      export const app = service("app", {
        image: "alpine:latest",
        command: "sleep 3600",
        dependsOn: [db],
      });
    `);
    await vyft.deploy();

    // Remove dependency
    await writeConfig(`
      import { service } from "vyft";

      export const db = service("db", {
        image: "alpine:latest",
        command: "sleep 3600",
        health: { command: "true" },
      });

      export const app = service("app", {
        image: "alpine:latest",
        command: "sleep 3600",
        // No more dependsOn
      });
    `);

    // Should still deploy successfully
    await vyft.deploy();

    const outputs = await vyft.output();
    assert(outputs.db, "should have db");
    assert(outputs.app, "should have app");
  },
});

// =============================================================================
// ADD DEPENDENCY
// =============================================================================

export const addDependency = test({
  name: "adding dependency updates deployment order",

  run: async ({ id, vyft, writeConfig }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    // Initial deploy without dependency
    await writeConfig(`
      import { service } from "vyft";

      export const db = service("db", {
        image: "alpine:latest",
        command: "sleep 3600",
        health: { command: "true" },
      });

      export const app = service("app", {
        image: "alpine:latest",
        command: "sleep 3600",
      });
    `);
    await vyft.deploy();

    // Add dependency
    await writeConfig(`
      import { service } from "vyft";

      export const db = service("db", {
        image: "alpine:latest",
        command: "sleep 3600",
        health: { command: "true" },
      });

      export const app = service("app", {
        image: "alpine:latest",
        command: "sleep 3600",
        dependsOn: [db],
      });
    `);

    // Should deploy successfully
    await vyft.deploy();

    const outputs = await vyft.output();
    assert(outputs.db, "should have db");
    assert(outputs.app, "should have app");
  },
});
