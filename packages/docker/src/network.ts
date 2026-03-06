import type { DockerClient } from "./client.ts";

interface NetworkInfo {
  Id: string;
  Name: string;
}

export async function ensureNetwork(
  client: DockerClient,
  name: string,
): Promise<string> {
  const existing = await client.get<NetworkInfo[]>(
    `/networks?filters=${encodeURIComponent(JSON.stringify({ name: [name] }))}`,
  );

  if (existing.status === 200 && Array.isArray(existing.body)) {
    const exact = existing.body.find((n) => n.Name === name);
    if (exact) return exact.Id;
  }

  const res = await client.post<{ Id: string }>("/networks/create", {
    Name: name,
    Driver: "bridge",
  });

  if (res.status !== 201) {
    throw new Error(`Failed to create network ${name}: ${res.status}`);
  }

  return res.body.Id;
}

export async function removeNetwork(
  client: DockerClient,
  name: string,
): Promise<void> {
  await client.del(`/networks/${name}`);
}
