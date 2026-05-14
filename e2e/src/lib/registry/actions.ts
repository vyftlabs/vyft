import { expect, type Page } from "@playwright/test";

export type Preset = "ghcr" | "docker" | "custom";

export type CreateInput =
  | {
      preset: Exclude<Preset, "custom">;
      username: string;
      password: string;
    }
  | {
      preset: "custom";
      name: string;
      url: string;
      username: string;
      password: string;
    };

/** Open the registries page, add a registry, wait for the dialog to close. */
export async function create(page: Page, input: CreateInput): Promise<void> {
  await page.goto("/registries");
  await page.getByTestId("registry-add-button").click();
  await page.getByTestId(`registry-preset-${input.preset}`).click();

  if (input.preset === "custom") {
    await page.getByTestId("registry-form-name").fill(input.name);
    await page.getByTestId("registry-form-url").fill(input.url);
  }
  await page.getByTestId("registry-form-username").fill(input.username);
  await page.getByTestId("registry-form-password").fill(input.password);

  const submit = page.getByTestId("registry-form-submit");
  await submit.click();
  await expect(submit).toBeHidden();
}

/** Delete the registry row identified by name. No-op if missing. */
export async function remove(page: Page, name: string): Promise<void> {
  await page.goto("/registries");
  const row = page.locator(`[data-testid="registry-row"][data-name="${name}"]`);
  if ((await row.count()) === 0) return;
  await row.getByTestId("registry-row-delete").click();
  await expect(row).toBeHidden();
}
