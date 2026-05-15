import { k8s, project, test } from "../lib/index.ts";

test("create project, add nginx, deploy → namespace + pod running", async ({ page, slug }) => {
  const proj = await project
    .create(page, { slug, name: `smoke ${slug}` })
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
