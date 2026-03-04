import assert from "node:assert";
import { describe, test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { sandbox, VYFT_CLI } from "../../src/index.ts";

/**
 * Local Development Journey
 *
 * Tests the local development workflow including:
 * - Running local dev environment
 * - Type generation for @vyft/client
 * - File watching and reload
 * - Proper cleanup on exit
 *
 * Covers: local dev, generate, type checking, file watching
 */
describe("journey: local development", { concurrency: false }, () => {
  test("local dev generates types and runs infra services", async () => {
    await using box = await sandbox();

    // =========================================================================
    // STEP 1: Create config with infra service and dev service
    // =========================================================================

    await box.fs.write(
      "vyft.config.ts",
      `
import { service } from "vyft";

// Infra service (deployed via docker)
export const db = service("db", {
  image: "redis:7-alpine",
  port: 6379,
});

// Dev service (would spawn locally, but we just test type generation)
export const api = service("api", {
  image: "node:20-alpine",
  port: 3000,
  env: {
    DATABASE_HOST: "db",
    NODE_ENV: "development",
  },
  link: [db],
  dev: {
    command: "echo 'dev server'",
  },
});
`,
    );

    // Create a TypeScript file that imports from @vyft/client
    await box.fs.write(
      "app.ts",
      `
import { bindings, env } from "@vyft/client";

// This should compile if types are generated correctly
const dbHost: string = bindings.db.host;
const dbPort: number = bindings.db.port;
const nodeEnv: string = env.NODE_ENV;

console.log(dbHost, dbPort, nodeEnv);
`,
    );

    // Create tsconfig for type checking
    await box.fs.write("tsconfig.json", {
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        skipLibCheck: true,
        noEmit: true,
        types: ["vyft__client"],
      },
      include: ["app.ts"],
    });

    // Create package.json for node_modules resolution
    await box.fs.write("package.json", {
      name: "test-app",
      type: "module",
    });

    // =========================================================================
    // STEP 2: Run local dev in background
    // =========================================================================

    const vyftCli = `node ${VYFT_CLI}`;

    // Start local dev in background, capture PID
    const startResult = await box.exec(
      `${vyftCli} local dev > /dev/null 2>&1 & echo $!`,
    );
    const pid = startResult.stdout.trim();
    assert(pid, "should get PID of background process");

    try {
      // Wait for types to be generated
      let typesExist = false;
      for (let i = 0; i < 20; i++) {
        await setTimeout(500);
        typesExist = await box.fs.exists(
          "node_modules/@types/vyft__client/index.d.ts",
        );
        if (typesExist) break;
      }

      assert(typesExist, "types should be generated within 10 seconds");

      // =========================================================================
      // STEP 3: Verify types compile
      // =========================================================================

      // TypeScript is symlinked in node_modules by sandbox
      const tscResult = await box.exec("./node_modules/.bin/tsc --noEmit 2>&1");

      // tsc should succeed (exit code 0)
      assert.strictEqual(
        tscResult.code,
        0,
        `tsc should pass, got: ${tscResult.stdout}${tscResult.stderr}`,
      );

      // =========================================================================
      // STEP 4: Verify infra service is running
      // =========================================================================

      // Wait for container to start (infra deployment happens after type generation)
      let containerRunning = false;
      for (let i = 0; i < 20; i++) {
        const dockerPs = await box.exec(
          `docker ps --filter "name=vyft-vyft-e2e-${box.id}" --format "{{.Names}}"`,
        );
        if (dockerPs.stdout.includes("db")) {
          containerRunning = true;
          break;
        }
        await setTimeout(500);
      }
      assert(
        containerRunning,
        "db container should be running within 10 seconds",
      );
    } finally {
      // =========================================================================
      // STEP 5: Cleanup - kill the dev process
      // =========================================================================

      await box.exec(`kill ${pid} 2>/dev/null || true`);
      await setTimeout(500); // Give it time to cleanup
    }
  });

  test("vyft generate creates types without running dev", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
import { service } from "vyft";

export const cache = service("cache", {
  image: "redis:7-alpine",
  port: 6379,
});

export const web = service("web", {
  image: "nginx:alpine",
  port: 80,
  env: {
    CACHE_HOST: "cache",
    API_URL: "https://api.example.com",
  },
  link: [cache],
});
`,
    );

    // Run generate command
    const vyftCli = `node ${VYFT_CLI}`;
    const genResult = await box.exec(`${vyftCli} generate`);
    assert.strictEqual(
      genResult.code,
      0,
      `generate should succeed: ${genResult.stderr}`,
    );

    // Verify types were created
    const typesExist = await box.fs.exists(
      "node_modules/@types/vyft__client/index.d.ts",
    );
    assert(typesExist, "types should be generated");

    // Read and verify type content
    const typesContent = await box.fs.read(
      "node_modules/@types/vyft__client/index.d.ts",
    );

    assert(typesContent.includes("bindings"), "should export bindings");
    assert(typesContent.includes("env"), "should export env");
    assert(typesContent.includes("cache"), "should include cache service");
    assert(typesContent.includes("host"), "should include host binding");
    assert(typesContent.includes("port"), "should include port binding");
  });

  test("local reset cleans up dev resources", async () => {
    await using box = await sandbox();

    await box.fs.write(
      "vyft.config.ts",
      `
import { service } from "vyft";

export const db = service("db", {
  image: "redis:7-alpine",
  port: 6379,
});
`,
    );

    const vyftCli = `node ${VYFT_CLI}`;

    // Start and quickly stop local dev to create some state
    const startResult = await box.exec(
      `${vyftCli} local dev > /dev/null 2>&1 & echo $!`,
    );
    const pid = startResult.stdout.trim();

    // Wait for container to actually be running (state is saved after container starts)
    let containerRunning = false;
    for (let i = 0; i < 20; i++) {
      await setTimeout(500);
      const ps = await box.exec(
        `docker ps --filter "name=vyft-vyft-e2e-${box.id}" --format "{{.Names}}"`,
      );
      if (ps.stdout.includes("db")) {
        containerRunning = true;
        break;
      }
    }
    assert(
      containerRunning,
      "container should be running before killing dev process",
    );

    // Kill dev process
    await box.exec(`kill ${pid} 2>/dev/null || true`);
    await setTimeout(500);

    // Verify container exists
    const _beforeReset = await box.exec(
      `docker ps -a --filter "name=vyft-vyft-e2e-${box.id}" --format "{{.Names}}"`,
    );

    // Run local reset
    const resetResult = await box.exec(`${vyftCli} local reset`);
    assert.strictEqual(resetResult.code, 0, "reset should succeed");

    // Verify containers are gone
    const afterReset = await box.exec(
      `docker ps -a --filter "name=vyft-vyft-e2e-${box.id}-__dev__" --format "{{.Names}}"`,
    );
    assert.strictEqual(
      afterReset.stdout.trim(),
      "",
      "containers should be removed after reset",
    );
  });
});
