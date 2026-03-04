import assert from "node:assert";
import { describe, test } from "node:test";
import { sandbox } from "../../src/index.ts";

/**
 * Drift Detection and Recovery Journey
 *
 * Tests the ability to detect when infrastructure has drifted from
 * the stored state and recover by redeploying.
 *
 * Covers: deploy, diff, refresh, manual docker operations, recovery
 */
describe(
  "journey: drift detection and recovery",
  { concurrency: false },
  () => {
    test("detect missing container and recover", async () => {
      await using box = await sandbox();

      // =========================================================================
      // STEP 1: Deploy a service
      // =========================================================================

      await box.fs.write(
        "vyft.config.ts",
        `
import { service } from "vyft";

export const app = service("app", {
  image: "nginx:alpine",
  port: 80,
});
`,
      );

      await box.vyft.deploy();

      // Verify no drift initially
      const initialDiff = await box.vyft.diff();
      assert.strictEqual(
        initialDiff.hasDrift,
        false,
        "should have no drift after deploy",
      );

      // =========================================================================
      // STEP 2: Manually remove the container (simulate drift)
      // =========================================================================

      // Find and remove the container directly via docker
      const result = await box.exec(
        `docker ps -aq --filter "name=vyft-vyft-e2e-${box.id}" | xargs -r docker rm -f`,
      );
      assert.strictEqual(result.code, 0, "should be able to remove container");

      // =========================================================================
      // STEP 3: Detect drift
      // =========================================================================

      const driftDiff = await box.vyft.diff();
      assert.strictEqual(
        driftDiff.hasDrift,
        true,
        "should detect drift after container removal",
      );
      assert(
        driftDiff.resources.some((r) => r.status === "missing"),
        "should report missing resource",
      );

      // =========================================================================
      // STEP 4: Recover by redeploying
      // =========================================================================

      // Use refresh flag to detect and recover from drift
      await box.vyft.deploy({ refresh: true });

      // Verify drift is resolved
      const recoveredDiff = await box.vyft.diff();
      assert.strictEqual(
        recoveredDiff.hasDrift,
        false,
        "should have no drift after recovery",
      );
    });

    test("refresh syncs state with live infrastructure", async () => {
      await using box = await sandbox();

      await box.fs.write(
        "vyft.config.ts",
        `
import { service } from "vyft";

export const web = service("web", {
  image: "nginx:alpine",
  port: 80,
});

export const api = service("api", {
  image: "nginx:alpine",
  port: 8080,
});
`,
      );

      await box.vyft.deploy();

      // Remove one container (container name: vyft-{project}-{stage}-{resource})
      // Project = vyft-e2e-{box.id}, Stage = {box.id}, Resource = web
      await box.exec(
        `docker ps -aq --filter "name=vyft-vyft-e2e-${box.id}-${box.id}-web" | xargs -r docker rm -f`,
      );

      // Refresh to sync state - removes missing resources from state
      await box.vyft.refresh();

      // Preview should show web needs to be created (config says it should exist, state says it's gone)
      const preview = await box.vyft.preview();
      assert(
        preview.some((c) => c.resource === "web" && c.action === "create"),
        "should show web needs to be created after refresh",
      );

      // Deploy to recover (refresh updated state, so deploy will recreate web)
      await box.vyft.deploy();

      // Now should be clean
      const finalDiff = await box.vyft.diff();
      assert.strictEqual(
        finalDiff.hasDrift,
        false,
        "should have no drift after redeploy",
      );
    });

    test("idempotent operations", async () => {
      await using box = await sandbox();

      await box.fs.write(
        "vyft.config.ts",
        `
import { service, volume } from "vyft";

export const data = volume("data");

export const app = service("app", {
  image: "nginx:alpine",
  port: 80,
  mounts: [{ source: data, path: "/data" }],
});
`,
      );

      // Deploy multiple times - should be idempotent
      await box.vyft.deploy();
      await box.vyft.deploy();
      await box.vyft.deploy();

      // Should still have no drift
      const diff = await box.vyft.diff();
      assert.strictEqual(
        diff.hasDrift,
        false,
        "multiple deploys should be idempotent",
      );

      // Preview should show no changes
      const preview = await box.vyft.preview();
      assert.strictEqual(preview.length, 0, "should have no pending changes");

      // Refresh multiple times
      await box.vyft.refresh();
      await box.vyft.refresh();

      // Still no drift
      const diffAfterRefresh = await box.vyft.diff();
      assert.strictEqual(
        diffAfterRefresh.hasDrift,
        false,
        "refresh should be idempotent",
      );
    });

    test("deploy with refresh flag reconciles before planning", async () => {
      await using box = await sandbox();

      await box.fs.write(
        "vyft.config.ts",
        `
import { service } from "vyft";

export const app = service("app", {
  image: "nginx:alpine",
  port: 80,
});
`,
      );

      await box.vyft.deploy();

      // Manually remove container
      await box.exec(
        `docker ps -aq --filter "name=vyft-vyft-e2e-${box.id}" | xargs -r docker rm -f`,
      );

      // Deploy with refresh - should detect drift and fix it
      await box.vyft.deploy({ refresh: true });

      // Verify recovered
      const diff = await box.vyft.diff();
      assert.strictEqual(
        diff.hasDrift,
        false,
        "deploy --refresh should recover from drift",
      );
    });
  },
);
