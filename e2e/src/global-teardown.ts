import { spawnSync } from "node:child_process"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, "../../..")

const CLUSTER_NAME = "vyft-e2e"

function shInherit(cmd: string, args: string[]): void {
  spawnSync(cmd, args, { cwd: projectRoot, stdio: "inherit" })
}

async function globalTeardown(): Promise<void> {
  if (process.env.E2E_KEEP_RUNNING === "1") {
    console.log("[e2e] E2E_KEEP_RUNNING=1 — leaving stack up")
    return
  }

  console.log("[e2e] tearing down compose...")
  shInherit("docker", ["compose", "-f", "compose.yml", "-f", "compose.test.yml", "down", "-v"])

  console.log("[e2e] deleting kind cluster...")
  shInherit("kind", ["delete", "cluster", "--name", CLUSTER_NAME])
}

export default globalTeardown

if (import.meta.url === `file://${process.argv[1]}`) {
  globalTeardown().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
