import { expect, type Page } from "@playwright/test";

function row(page: Page, name: string) {
  return page.locator(`[data-testid="registry-row"][data-name="${name}"]`);
}

export async function exists(page: Page, name: string): Promise<void> {
  await page.goto("/registries");
  await expect(row(page, name)).toBeVisible();
}

export async function missing(page: Page, name: string): Promise<void> {
  await page.goto("/registries");
  await expect(row(page, name)).toHaveCount(0);
}
