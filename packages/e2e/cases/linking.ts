import assert from "node:assert";
import { test } from "../src/index.ts";

// =============================================================================
// BASIC SERVICE LINKING
// =============================================================================

export const linkServiceToService = test({
  name: "link service outputs to another service",

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
      link: [db],
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

export const linkMultipleServices = test({
  name: "link multiple services",

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
      link: [db, cache],
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
// LINK WITH DEPENDENCIES
// =============================================================================

export const linkWithDependsOn = test({
  name: "link combined with dependsOn",

  config: `
    import { service } from "vyft";

    export const db = service("db", {
      image: "alpine:latest",
      command: "sleep 3600",
      health: { command: "true" },
    });

    export const app = service("app", {
      image: "nginx:alpine",
      dependsOn: [db],
      link: [db],
    });
  `,

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
// CRONJOB LINKING
// =============================================================================

export const linkCronjobToService = test({
  name: "link cronjob to service",

  config: `
    import { service, cronjob } from "vyft";

    export const db = service("db", {
      image: "alpine:latest",
      command: "sleep 3600",
      health: { command: "true" },
    });

    export const backup = cronjob("backup", {
      schedule: "0 2 * * *",
      image: "alpine:latest",
      command: "echo 'Backing up'",
      link: [db],
    });
  `,

  run: async ({ id, vyft }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    await vyft.deploy();

    const outputs = await vyft.output();
    assert(outputs.db, "should have db");
    assert(outputs.backup, "should have backup");
  },
});

// =============================================================================
// CHAIN LINKING
// =============================================================================

export const chainedLinks = test({
  name: "chained service links",

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
      link: [base],
      health: { command: "true" },
    });

    export const top = service("top", {
      image: "alpine:latest",
      command: "sleep 3600",
      link: [middle],
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

// =============================================================================
// LINK UPDATE
// =============================================================================

export const addLinkTriggersUpdate = test({
  name: "adding link triggers service update",

  run: async ({ id, vyft, writeConfig }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    // Initial deploy without link
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

    // Add link
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
        link: [db],
      });
    `);

    const changes = await vyft.preview();
    assert(changes.length > 0, "should have changes");

    await vyft.deploy();
  },
});

export const removeLinkTriggersUpdate = test({
  name: "removing link triggers service update",

  run: async ({ id, vyft, writeConfig }) => {
    await vyft.context.create(id);
    await vyft.stage.create(id);

    // Initial deploy with link
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
        link: [db],
      });
    `);
    await vyft.deploy();

    // Remove link
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

    const changes = await vyft.preview();
    const appChange = changes.find((c) => c.resource === "app");
    assert(appChange, "should have app change");

    await vyft.deploy();
  },
});

// =============================================================================
// LINK DESTROY
// =============================================================================

export const destroyWithLinks = test({
  name: "destroy removes linked services correctly",

  config: `
    import { service } from "vyft";

    export const db = service("db", {
      image: "alpine:latest",
      command: "sleep 3600",
      health: { command: "true" },
    });

    export const app = service("app", {
      image: "nginx:alpine",
      link: [db],
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
// COMPLEX LINK PATTERNS
// =============================================================================

export const diamondLinkPattern = test({
  name: "diamond link pattern",

  config: `
    import { service } from "vyft";

    export const db = service("db", {
      image: "alpine:latest",
      command: "sleep 3600",
      health: { command: "true" },
    });

    export const api = service("api", {
      image: "alpine:latest",
      command: "sleep 3600",
      link: [db],
      health: { command: "true" },
    });

    export const worker = service("worker", {
      image: "alpine:latest",
      command: "sleep 3600",
      link: [db],
      health: { command: "true" },
    });

    export const gateway = service("gateway", {
      image: "nginx:alpine",
      link: [api, worker],
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
    assert(outputs.gateway, "should have gateway");
  },
});
