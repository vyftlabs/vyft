import { execFile } from "node:child_process";

function exec(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout.trim());
    });
  });
}

const CONTAINER_NAME = "vyft-buildkitd";

/** Returns the BUILDKIT_HOST value. Starts a BuildKit container if needed. */
export async function ensureBuildKit(): Promise<string> {
  const fromEnv = process.env["BUILDKIT_HOST"];
  if (fromEnv) {
    return fromEnv;
  }

  const host = `docker-container://${CONTAINER_NAME}`;

  try {
    const status = await exec("docker", [
      "inspect",
      "-f",
      "{{.State.Running}}",
      CONTAINER_NAME,
    ]);
    if (status === "true") {
      return host;
    }
  } catch {
    // Container doesn't exist — fall through to create it
  }

  // Remove stopped container if it exists
  try {
    await exec("docker", ["rm", CONTAINER_NAME]);
  } catch {
    // Ignore — container didn't exist
  }

  await exec("docker", [
    "run",
    "-d",
    "--name",
    CONTAINER_NAME,
    "--privileged",
    "moby/buildkit:latest",
  ]);

  return host;
}
