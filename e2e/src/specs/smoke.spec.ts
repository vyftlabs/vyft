import { test, expect } from "@playwright/test"
import { loginAsAdmin } from "../helpers/auth.ts"
import { getConfigMap, getDeployment, waitForDeploymentReady } from "../helpers/k8s.ts"

test("create project, add service, deploy, pod becomes available", async ({ page, context }) => {
  await loginAsAdmin(context)

  // Projects page → create project
  await page.goto("/projects")
  await page.getByTestId("project-create-button").click()
  await page.getByTestId("project-name-input").fill("demo")
  await page.getByTestId("project-create-submit").click()

  // Landed on the services canvas; since the project is empty the
  // AddResourceDialog auto-opens — pick Container Image directly.
  await page.getByTestId("service-source-image-option").click()

  // Service drawer opens in create mode. Fill the minimum required fields.
  await page.getByTestId("service-name-input").fill("whoami")
  await page.getByTestId("service-image-input").fill("traefik/whoami:latest")
  await page.getByTestId("service-port-input").fill("80")
  await page.getByTestId("service-create-submit").click()

  // Service now has unsaved changes → Deploy button appears.
  await expect(page.getByTestId("deploy-button")).toBeVisible()
  await page.getByTestId("deploy-button").click()

  // Deployment succeeds → button hides (checksum matches, hasChanges false).
  await expect(page.getByTestId("deploy-button")).toBeHidden({ timeout: 120_000 })

  // Cross-check at the cluster: the Deployment the adapter applied is available.
  await waitForDeploymentReady("vyft-demo", "whoami", { timeoutMs: 60_000 })

  // ApplySet parent ConfigMap exists with correct tooling + labels (KEP-3659).
  const parent = await getConfigMap("vyft-demo", "applyset-svc-whoami")
  expect(parent.metadata?.annotations?.["applyset.kubernetes.io/tooling"]).toBe("vyft/v1")
  const applysetId = parent.metadata?.labels?.["applyset.kubernetes.io/id"]
  expect(applysetId, "parent must have applyset id label").toBeTruthy()
  expect(parent.metadata?.annotations?.["applyset.kubernetes.io/contains-group-kinds"])
    .toContain("deployments.apps")

  // Member Deployment carries part-of label matching the parent's id.
  const dep = await getDeployment("vyft-demo", "whoami")
  expect(dep.metadata?.labels?.["applyset.kubernetes.io/part-of"]).toBe(applysetId)
})
