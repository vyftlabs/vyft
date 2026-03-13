import type { DockerClient } from "../client/index.ts";
import { docker } from "../runtime.ts";

interface NetworkInfo {
  Id: string;
  Name: string;
}

async function findNetwork(
  client: DockerClient,
  name: string,
): Promise<string | undefined> {
  const existing = await client.get<NetworkInfo[]>(
    `/networks?filters=${encodeURIComponent(JSON.stringify({ name: [name] }))}`,
  );
  if (existing.status === 200 && Array.isArray(existing.body)) {
    const exact = existing.body.find((n) => n.Name === name);
    if (exact) return exact.Id;
  }
  return undefined;
}

interface NetworkInput {
  name: string;
}

const network = docker.resource<NetworkInput>("network", {
  async create({ input, ctx }) {
    const existingId = await findNetwork(ctx.client, input.name);
    if (existingId) {
      return { output: { networkId: existingId, name: input.name } };
    }

    const res = await ctx.client.post<{ Id: string }>("/networks/create", {
      Name: input.name,
      Driver: "bridge",
    });

    if (res.status !== 201) {
      throw new Error(`Failed to create network ${input.name}: ${res.status}`);
    }

    return { output: { networkId: res.body.Id, name: input.name } };
  },

  async read({ input, ctx }) {
    const id = await findNetwork(ctx.client, input.name);
    if (!id) return {};
    return { networkId: id, name: input.name };
  },

  async delete({ input, ctx }) {
    await ctx.client.del(`/networks/${input.name}`);
  },

  async diff() {
    return { action: "none" };
  },
});

export default network;
