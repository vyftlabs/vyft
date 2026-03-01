import type { DockerClient } from "./client.ts";

/** Create a Docker volume. */
export async function createVolume(
  client: DockerClient,
  name: string,
  labels?: Record<string, string>,
): Promise<void> {
  await client.post("/volumes/create", { Name: name, Labels: labels });
}

/** Remove a Docker volume, ignoring 404. */
export async function removeVolume(
  client: DockerClient,
  name: string,
): Promise<void> {
  await client.del(`/volumes/${name}`);
}
