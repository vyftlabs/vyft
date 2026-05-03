import { spawnSync } from "node:child_process"
import { mkdirSync, writeFileSync, existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { setTimeout as sleep } from "node:timers/promises"
import { chromium } from "@playwright/test"
import { TEST_ADMIN } from "./helpers/auth.ts"

const __dirname = dirname(fileURLToPath(import.meta.url))
const e2eRoot = resolve(__dirname, "..")
const projectRoot = resolve(e2eRoot, "../..")

const CLUSTER_NAME = "vyft-e2e"
const HOST_DATABASE_URL = "postgres://postgres:postgres@localhost:5432/postgres"
const APP_URL = "http://localhost:3000"

function sh(
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv; allowFail?: boolean } = {},
): string {
  const result = spawnSync(cmd, args, {
    cwd: opts.cwd ?? projectRoot,
    env: opts.env ?? process.env,
    stdio: ["ignore", "pipe", "inherit"],
    encoding: "utf8",
  })
  if (result.error) {
    const code = (result.error as NodeJS.ErrnoException).code
    if (code === "ENOENT") {
      throw new Error(`\`${cmd}\` not found on PATH — install it and retry`)
    }
    throw result.error
  }
  if (result.status !== 0 && !opts.allowFail) {
    throw new Error(`\`${cmd} ${args.join(" ")}\` failed with exit ${result.status}`)
  }
  return result.stdout ?? ""
}

function shInherit(
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv; allowFail?: boolean } = {},
): void {
  const result = spawnSync(cmd, args, {
    cwd: opts.cwd ?? projectRoot,
    env: opts.env ?? process.env,
    stdio: "inherit",
  })
  if (result.error) {
    const code = (result.error as NodeJS.ErrnoException).code
    if (code === "ENOENT") {
      throw new Error(`\`${cmd}\` not found on PATH — install it and retry`)
    }
    throw result.error
  }
  if (result.status !== 0 && !opts.allowFail) {
    throw new Error(`\`${cmd} ${args.join(" ")}\` failed with exit ${result.status}`)
  }
}

async function waitForHttp(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastErr: unknown
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch (err) {
      lastErr = err
    }
    await sleep(1000)
  }
  throw new Error(`timed out waiting for ${url}${lastErr ? ` (last error: ${lastErr})` : ""}`)
}

async function waitForPostgres(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const r = spawnSync("docker", ["compose", "exec", "-T", "postgres", "pg_isready", "-U", "postgres"], {
      cwd: projectRoot,
      stdio: "ignore",
    })
    if (r.status === 0) return
    await sleep(1000)
  }
  throw new Error("timed out waiting for postgres")
}

async function globalSetup(): Promise<void> {
  console.log("[e2e] ensuring kind cluster...")
  const existing = sh("kind", ["get", "clusters"], { allowFail: true })
  if (!existing.split("\n").includes(CLUSTER_NAME)) {
    shInherit("kind", [
      "create", "cluster",
      "--name", CLUSTER_NAME,
      "--config", resolve(e2eRoot, "kind.yaml"),
      "--wait", "60s",
    ])
  } else {
    console.log(`[e2e] cluster ${CLUSTER_NAME} already exists, reusing`)
  }

  console.log("[e2e] writing internal kubeconfig...")
  const internal = sh("kind", ["get", "kubeconfig", "--internal", "--name", CLUSTER_NAME])
  const kubeDir = resolve(e2eRoot, ".kube")
  if (!existsSync(kubeDir)) mkdirSync(kubeDir, { recursive: true })
  writeFileSync(resolve(kubeDir, "config"), internal)

  console.log("[e2e] starting postgres + redis...")
  shInherit("docker", ["compose", "up", "-d", "postgres", "redis"])
  await waitForPostgres(30_000)

  console.log("[e2e] running migrations...")
  shInherit("pnpm", ["--filter", "@vyft/api", "run", "db:migrate"], {
    env: { ...process.env, DATABASE_URL: HOST_DATABASE_URL },
  })

  console.log("[e2e] building + starting app...")
  shInherit("docker", ["compose", "-f", "compose.yml", "-f", "compose.test.yml", "up", "-d", "--build", "app"])

  console.log("[e2e] waiting for app health...")
  await waitForHttp(`${APP_URL}/api/health`, 120_000)

  console.log("[e2e] seeding admin user + org via setup UI...")
  await seedViaSetupPage()

  console.log("[e2e] ready")
}

async function seedViaSetupPage(): Promise<void> {
  const browser = await chromium.launch()
  try {
    const context = await browser.newContext({ baseURL: APP_URL })
    const page = await context.newPage()

    page.on("console", (msg) => console.log(`[browser:${msg.type()}]`, msg.text()))
    page.on("pageerror", (err) => console.log("[browser:error]", err.message))
    page.on("requestfailed", (req) => console.log("[browser:reqfail]", req.url(), req.failure()?.errorText))

    const resp = await page.goto("/setup")
    console.log(`[e2e] /setup → ${resp?.status()} ${resp?.url()}`)

    try {
      await page.getByTestId("setup-name-input").waitFor({ timeout: 10_000 })
    } catch (err) {
      console.log(`[e2e] setup form not found. url=${page.url()}`)
      console.log(`[e2e] title=${await page.title()}`)
      console.log(`[e2e] body head:`, (await page.content()).slice(0, 2000))
      throw err
    }

    await page.getByTestId("setup-name-input").fill("Admin")
    await page.getByTestId("setup-email-input").fill(TEST_ADMIN.email)
    await page.getByTestId("setup-password-input").fill(TEST_ADMIN.password)
    await page.getByTestId("setup-org-name-input").fill("Test Org")
    await page.getByTestId("setup-submit").click()
    await page.waitForURL("**/login", { timeout: 15_000 })
  } finally {
    await browser.close()
  }
}

export default globalSetup

if (import.meta.url === `file://${process.argv[1]}`) {
  globalSetup().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
