import { execSync } from "node:child_process";

function cleanup() {
  console.log("\n[e2e] Cleaning up docker resources...");
  try {
    execSync(
      'docker ps -aq --filter "name=vyft-vyft-e2e" | xargs -r docker rm -f',
      { stdio: "ignore" },
    );
    execSync(
      'docker network ls -q --filter "name=vyft-vyft-e2e" | xargs -r docker network rm',
      { stdio: "ignore" },
    );
  } catch {
    // Best effort
  }
}

process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});

process.on("SIGTERM", () => {
  cleanup();
  process.exit(143);
});
