import type { DockerClient } from "./client.ts";

/** Ensure a bridge network exists. */
export async function ensureNetwork(
  client: DockerClient,
  name: string,
  labels?: Record<string, string>,
): Promise<void> {
  await client.post("/networks/create", {
    Name: name,
    Driver: "bridge",
    CheckDuplicate: true,
    Labels: labels,
  });
}

/** Remove a bridge network, ignoring 404. */
export async function removeNetwork(
  client: DockerClient,
  name: string,
): Promise<void> {
  try {
    await client.del(`/networks/${name}`);
  } catch {
    // Ignore 404 if network doesn't exist
  }
}
