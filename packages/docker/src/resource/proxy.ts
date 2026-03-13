import { docker } from "../runtime.ts";

const PROXY_IMAGE = "lucaslorentz/caddy-docker-proxy:2.9";
const PROXY_CONTAINER_PREFIX = "vyft-proxy";

interface ProxyInput {
  name: string;
  networkName: string;
}

function proxyContainerName(id: string): string {
  return `${PROXY_CONTAINER_PREFIX}-${id}`;
}

function containerConfig(input: ProxyInput) {
  return {
    Image: PROXY_IMAGE,
    Env: [],
    Labels: {
      "vyft.managed": "true",
      "vyft.proxy": "true",
    },
    HostConfig: {
      RestartPolicy: { Name: "unless-stopped" },
      NetworkMode: input.networkName,
      Binds: ["/var/run/docker.sock:/var/run/docker.sock:ro"],
      PortBindings: {
        "80/tcp": [{ HostPort: "80" }],
        "443/tcp": [{ HostPort: "443" }],
      },
    },
    ExposedPorts: {
      "80/tcp": {},
      "443/tcp": {},
    },
  };
}

const proxy = docker.resource<ProxyInput>("proxy", {
  async create({ input, ctx }) {
    const name = proxyContainerName(input.name);

    // Check if container already exists (idempotent)
    const existing = await ctx.client.get(`/containers/${name}/json`);
    if (existing.status === 200) {
      const body = existing.body as { Id: string };
      return { output: { containerId: body.Id, name } };
    }

    // Pull the caddy-docker-proxy image
    const pullRes = await ctx.client.post(
      `/images/create?fromImage=${encodeURIComponent("lucaslorentz/caddy-docker-proxy")}&tag=2.9`,
    );
    if (pullRes.status !== 200) {
      throw new Error(`Failed to pull proxy image: ${pullRes.status}`);
    }

    const res = await ctx.client.post<{ Id: string }>(
      `/containers/create?name=${encodeURIComponent(name)}`,
      containerConfig(input),
    );

    // Handle race condition: another deploy created it between our check and create
    if (res.status === 409) {
      const inspect = await ctx.client.get(`/containers/${name}/json`);
      if (inspect.status === 200) {
        const body = inspect.body as { Id: string };
        return { output: { containerId: body.Id, name } };
      }
    }

    if (res.status !== 201) {
      throw new Error(`Failed to create proxy container: ${res.status}`);
    }

    await ctx.client.post(`/containers/${res.body.Id}/start`);

    return { output: { containerId: res.body.Id, name } };
  },

  async read({ input, ctx }) {
    const name = proxyContainerName(input.name);
    const res = await ctx.client.get(`/containers/${name}/json`);
    if (res.status !== 200) return {};
    const body = res.body as { Id: string };
    return { containerId: body.Id, name };
  },

  async update({ input, ctx }) {
    const name = proxyContainerName(input.name);

    await ctx.client.post(`/containers/${name}/stop`).catch(() => {});
    await ctx.client.del(`/containers/${name}?force=true`).catch(() => {});

    const res = await ctx.client.post<{ Id: string }>(
      `/containers/create?name=${encodeURIComponent(name)}`,
      containerConfig(input),
    );

    if (res.status !== 201) {
      throw new Error(`Failed to recreate proxy container: ${res.status}`);
    }

    await ctx.client.post(`/containers/${res.body.Id}/start`);

    return { containerId: res.body.Id, name };
  },

  async delete({ input, ctx }) {
    const name = proxyContainerName(input.name);
    await ctx.client.post(`/containers/${name}/stop`).catch(() => {});
    await ctx.client.del(`/containers/${name}?force=true`);
  },

  async diff() {
    return { action: "none" };
  },
});

export default proxy;
