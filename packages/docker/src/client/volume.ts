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
  const maxAttempts = 5;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await client.del(`/volumes/${name}?force=true`);
    if (res.status === 204 || res.status === 404) return;
    if (res.status === 409 && attempt < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, 500));
      continue;
    }
    throw new Error(`Failed to remove volume ${name}: ${res.status}`);
  }
}
