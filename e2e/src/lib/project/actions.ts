import { expect, type Page } from "@playwright/test";

import { namespaceFor } from "../k8s/client.ts";
import { createImage, type ImageInput } from "../resource/actions.ts";
import type { ProjectHandle } from "../types.ts";

export type CreateInput = {
  slug: string;
  name?: string;
};

/**
 * Open the create-project dialog from the projects index, submit it, then
 * navigate into the project by clicking its card.
 */
export async function create(page: Page, input: CreateInput): Promise<ProjectHandle> {
  const name = input.name ?? input.slug;
  await page.goto("/");
  await page.getByTestId("project-create-button").first().click();
  await page.getByTestId("project-name-input").fill(name);
  await page.getByLabel("Slug").fill(input.slug);

  const createResponse = page.waitForResponse(
    (r) => r.url().endsWith("/api/projects") && r.request().method() === "POST" && r.status() === 201,
  );
  await page.getByTestId("project-create-submit").click();
  await createResponse;

  await page.goto("/");
  await page.locator(`[data-testid="project-card"][data-slug="${input.slug}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${input.slug}`));

  return { slug: input.slug, name, namespace: namespaceFor(input.slug) };
}

/**
 * Click the deploy button and wait for the deployment to complete. The
 * button unmounts once `applied` (no pending changes), so success is
 * detected by `Deploying` → element hidden.
 */
export async function deploy(page: Page, opts: { timeoutMs?: number } = {}): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const button = page.getByTestId("deploy-button");
  await button.click();
  await expect(button).toHaveText(/Deploying/, { timeout: 30_000 });
  await expect(button).toBeHidden({ timeout: timeoutMs });
}

/**
 * Delete a project via the settings page → danger zone confirm dialog.
 * Idempotent: silently returns if the project doesn't exist.
 */
export async function remove(page: Page, slug: string): Promise<void> {
  const res = await page.goto(`/projects/${slug}/settings`, { waitUntil: "domcontentloaded" });
  if (res && res.status() === 404) return;

  const trigger = page.getByRole("button", { name: "Delete project" });
  if ((await trigger.count()) === 0) return;
  await trigger.click();

  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder(slug).fill(slug);
  await dialog.getByRole("button", { name: "Delete project" }).click();

  await page.waitForURL(/\/(?:projects)?$/, { timeout: 30_000 });
}

// Re-export the resource action signature for the chain.
export { createImage as createImageService };
export type { ImageInput };
