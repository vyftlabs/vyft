import { k8s, project, test } from "../lib/index.ts";

test("deploy postgres with secret password → pod running", async ({ page, slug }) => {
  const proj = await project
    .create(page, { slug, name: `pg ${slug}` })
    .createImageService({
      name: "postgres",
      image: "postgres:17-alpine",
      port: 5432,
      env: [{ key: "POSTGRES_PASSWORD", value: "s3cret", secret: true }],
    })
    .deploy();

  await k8s.assert.namespace(proj);
  // Postgres exits on boot without POSTGRES_PASSWORD, so a Running pod proves
  // the secret env var actually reached the container.
  await k8s.assert.pod(proj, { resource: proj.resources.postgres.slug, image: "postgres:17-alpine" });
});
