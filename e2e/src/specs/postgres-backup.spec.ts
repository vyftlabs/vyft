import { expect, project, test } from "../lib/index.ts";

// Real end-to-end backup flow for a managed (CNPG) Postgres resource, driven
// and verified entirely through the UI:
//   1. create Postgres + a MinIO object store (auto-creates the bucket)
//   2. configure scheduled backups (Backups tab → Configure dialog) at MinIO
//   3. deploy — one apply brings up MinIO + the cluster with backups wired
//   4. force an on-demand backup ("Back up now")
//   5. pass once the Backups tab shows a backup "Completed"

const MINIO_USER = "minioadmin";
const MINIO_PASS = "minioadmin123";
const BUCKET = "pgbackups";

test("postgres: configure backups via UI, force one, it completes", async ({
  page,
  slug,
}) => {
  test.setTimeout(900_000);

  // Create project + MinIO object store + managed Postgres (not deployed yet).
  const proj = await project
    .create(page, { slug, name: `pg-backup ${slug}` })
    .createImageService({
      name: "minio",
      image: "bitnamilegacy/minio:latest",
      port: 9000,
      env: [
        { key: "MINIO_ROOT_USER", value: MINIO_USER },
        { key: "MINIO_ROOT_PASSWORD", value: MINIO_PASS, secret: true },
        { key: "MINIO_DEFAULT_BUCKETS", value: BUCKET },
      ],
    })
    .createPostgres({ name: "db" });

  const minioSlug = proj.resources.minio.slug;

  // Configure backups on the Postgres resource before deploying, so a single
  // apply brings up the cluster already wired to the object store.
  await page.locator('[data-testid="service.node"][data-name="db"]').click({ timeout: 30_000 });
  await page.getByTestId("service.drawer.tab.backups").click({ timeout: 30_000 });
  await page.getByTestId("service.backups.configure").click({ timeout: 30_000 });

  await page
    .getByTestId("service.backups.dialog.dest")
    .fill(`s3://${BUCKET}/pg`);
  await page
    .getByTestId("service.backups.dialog.endpoint")
    .fill(`http://${minioSlug}:9000`);
  await page.getByTestId("service.backups.dialog.region").fill("us-east-1");
  await page.getByTestId("service.backups.dialog.akid").fill(MINIO_USER);
  await page.getByTestId("service.backups.dialog.sak").fill(MINIO_PASS);

  const saved = page.waitForResponse(
    (r) =>
      /\/api\/projects\/[^/]+\/resources\/[^/]+$/.test(r.url()) &&
      r.request().method() === "PATCH" &&
      r.status() === 200,
  );
  const saveBtn = page.getByTestId("service.backups.dialog.save");
  await saveBtn.click({ timeout: 30_000 });
  await saved;
  await expect(saveBtn).toBeHidden(); // dialog closed on success

  // Close the drawer. It closes on backdrop click (not Escape); click a top-left
  // corner since the drawer itself covers the backdrop's center.
  const drawer = page.getByTestId("service.drawer");
  await page
    .getByTestId("service.drawer.backdrop")
    .click({ position: { x: 5, y: 5 }, timeout: 30_000 });
  await expect(drawer).toBeHidden();

  // Deploy: applies MinIO + the Postgres cluster (with barmanObjectStore +
  // ScheduledBackup) in one go.
  const deployBtn = page.getByTestId("deploy-button");
  await expect(deployBtn).toBeVisible({ timeout: 30_000 });
  await deployBtn.click();
  await expect(deployBtn).toBeHidden({ timeout: 300_000 });

  // Reopen the Postgres drawer → Backups tab → force an on-demand backup.
  await expect(drawer).toBeHidden();
  await page.locator('[data-testid="service.node"][data-name="db"]').click({ timeout: 60_000 });
  await expect(drawer).toBeVisible();
  await page.getByTestId("service.drawer.tab.backups").click({ timeout: 30_000 });
  await page.getByTestId("service.backups.run").click({ timeout: 30_000 });

  // Pass condition: a backup row reports "Completed" (the tab polls itself).
  await expect(page.getByTestId("service.backups.phase").first()).toHaveText(
    "Completed",
    { timeout: 600_000 },
  );
});
