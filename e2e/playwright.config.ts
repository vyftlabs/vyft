import { defineConfig } from "@playwright/test";

import { BACKEND_URL, BASIC_AUTH, WEB_URL } from "./config.ts";

export default defineConfig({
  testDir: "./src/specs",
  fullyParallel: true,
  workers: process.env.PW_WORKERS ? Number(process.env.PW_WORKERS) : undefined,
  timeout: 180_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: "list",
  webServer: [
    {
      command: "pnpm exec nx build web && pnpm exec nx preview web",
      cwd: "..",
      url: WEB_URL,
      reuseExistingServer: true,
      timeout: 300_000,
    },
    {
      command: "go run ./cmd/backend",
      cwd: "../apps/backend",
      url: `${BACKEND_URL}/healthz`,
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        KUBECONFIG: "../../.kube/config",
        BASIC_AUTH_USER: BASIC_AUTH.username,
        BASIC_AUTH_PASS: BASIC_AUTH.password,
      },
    },
  ],
  use: {
    baseURL: WEB_URL,
    httpCredentials: BASIC_AUTH,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
