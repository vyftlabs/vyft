import type { DockerClient } from "./index.ts";

export async function pullImage(
  client: DockerClient,
  image: string,
): Promise<void> {
  const [name, tag] = image.includes(":")
    ? [image.slice(0, image.indexOf(":")), image.slice(image.indexOf(":") + 1)]
    : [image, "latest"];

  const res = await client.post(
    `/images/create?fromImage=${encodeURIComponent(name)}&tag=${encodeURIComponent(tag)}`,
  );

  if (res.status !== 200) {
    throw new Error(`Failed to pull image ${image}: ${res.status}`);
  }
}
