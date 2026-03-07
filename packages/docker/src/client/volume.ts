import type { DockerClient } from "./index.ts";

export async function createVolume(
  client: DockerClient,
  name: string,
): Promise<void> {
  const res = await client.post("/volumes/create", {
    Name: name,
    Driver: "local",
  });
  if (res.status !== 201) {
    throw new Error(`Failed to create volume ${name}: ${res.status}`);
  }
}

export async function removeVolume(
  client: DockerClient,
  name: string,
): Promise<void> {
  await client.del(`/volumes/${name}`);
}
