import { expect, type Page } from "@playwright/test";

export type EnvVar = {
  key: string;
  value: string;
  secret?: boolean;
};

export type ImageInput = {
  name: string;
  image: string;
  port?: number;
  env?: Record<string, string> | EnvVar[];
};

/**
 * Drive the "Add resource → container image" flow and submit the
 * create-service drawer. Must be called on a project page.
 */
export async function createImage(page: Page, input: ImageInput): Promise<void> {
  const picker = page.getByTestId("service.picker.image");
  const addBtn = page.getByTestId("service.canvas.add");
  // Empty projects auto-open the resource picker; existing ones expose an
  // "Add resource" button on the canvas. Wait for whichever appears first.
  await picker.or(addBtn).first().waitFor({ state: "visible" });
  if (!(await picker.isVisible())) {
    await addBtn.click();
  }
  await picker.click();

  const drawer = page.getByTestId("service.drawer");
  await expect(drawer).toBeVisible();
  await drawer.getByTestId("service.form.name").fill(input.name);
  await drawer.getByTestId("service.form.image").fill(input.image);
  if (input.port !== undefined) {
    await drawer.getByTestId("service.form.port").fill(String(input.port));
  }

  for (const v of normalizeEnv(input.env)) {
    await addEnvVar(page, drawer, v);
  }

  await page.getByTestId("service.drawer.create-submit").click();
  await expect(drawer).toBeHidden();
}

function normalizeEnv(env: ImageInput["env"]): EnvVar[] {
  if (!env) return [];
  if (Array.isArray(env)) return env;
  return Object.entries(env).map(([key, value]) => ({ key, value, secret: false }));
}

async function addEnvVar(page: Page, drawer: ReturnType<Page["getByTestId"]>, v: EnvVar): Promise<void> {
  await drawer.getByTestId("service.form.variables.add").click();

  const submit = page.getByTestId("service.form.variables.dialog.submit");
  await submit.waitFor({ state: "visible" });

  await page.getByTestId("service.form.variables.dialog.key").fill(v.key);

  const secretToggle = page.getByTestId("service.form.variables.dialog.secret");
  const isSecret = (await secretToggle.getAttribute("data-state")) === "checked";
  const wantSecret = v.secret ?? false;
  if (isSecret !== wantSecret) await secretToggle.click();

  await page.getByTestId("service.form.variables.dialog.value").fill(v.value);
  await submit.click();
  await expect(submit).toBeHidden();
}
