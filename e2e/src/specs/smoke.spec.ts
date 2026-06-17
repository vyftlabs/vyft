import { k8s, project, test } from "../lib/index.ts";

test("smoke", async ({ page, slug }) => {
  const chain = project.create(page, { slug, name: `smoke ${slug}` });
  await chain;
  await project.expectNoPendingChanges(page);

  const proj = await chain
    .createImageService({
      name: "nginx",
      image: "nginx:alpine",
      port: 80,
      env: { LOG_LEVEL: "info" },
    })
    .deploy();

  await k8s.assert.namespace(proj);
  await k8s.assert.pod(proj, { resource: proj.resources.nginx.slug, image: "nginx:alpine" });
});
