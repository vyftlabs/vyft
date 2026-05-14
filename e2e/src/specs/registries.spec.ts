import { k8s, project, registry, test } from "../lib/index.ts";

test("custom registry: UI CRUD + dockerconfigjson syncs into project namespace", async ({
  page,
  slug,
}) => {
  const name = `e2e-${Math.random().toString(36).slice(2, 6)}`;

  const proj = await project.create(page, { slug, name: `smoke ${slug}` });

  await registry.create(page, {
    preset: "custom",
    name,
    url: "https://registry.example.com",
    username: "tester",
    password: "secret",
  });
  await registry.assert.exists(page, name);
  await k8s.assert.registrySecret(proj, { registry: name });

  await registry.remove(page, name);
  await registry.assert.missing(page, name);
});
