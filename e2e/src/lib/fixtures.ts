import { test as base } from "@playwright/test";

import { remove } from "./project/actions.ts";

/**
 * Adds a `slug` fixture: each test gets a unique slug and an afterEach
 * that deletes the project (if it was created). Cleanup is best-effort.
 */
export const test = base.extend<{ slug: string }>({
  slug: async ({ page }, use) => {
    const slug = `smoke-${Math.random().toString(36).slice(2, 6)}`;
    try {
      await use(slug);
    } finally {
      try {
        await remove(page, slug);
      } catch {
        // best-effort
      }
    }
  },
});

export { expect } from "@playwright/test";
