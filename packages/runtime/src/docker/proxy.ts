import type { CaddyRoute } from "./caddy.ts";
import { generateCaddyConfig, pushCaddyConfig } from "./caddy.ts";
import type { DockerClient } from "./client.ts";

const CADDY_IMAGE = "caddy:2-alpine";
const ADMIN_PORT = 2019;

/** Deploy or update the Caddy proxy container. */
export async function deployProxy(
  client: DockerClient,
  containerName: string,
  networkName: string,
  routes: CaddyRoute[],
): Promise<void> {
  await ensureProxy(client, containerName, networkName);
  const config = generateCaddyConfig(routes);
  // Give Caddy a moment to start if just created
  await new Promise((r) => setTimeout(r, 500));
  await pushCaddyConfig(ADMIN_PORT, config);
}

/** Ensure the Caddy container is running. */
async function ensureProxy(
  client: DockerClient,
  containerName: string,
  networkName: string,
): Promise<void> {
  try {
    const info = (await client.get(`/containers/${containerName}/json`)) as {
      State: { Running: boolean };
    };
    if (info.State.Running) return;
    await client.post(`/containers/${containerName}/start`);
    return;
  } catch {
    // Container doesn't exist, create it
  }

  const certVolume = `${containerName}-certs`;
  const dataVolume = `${containerName}-data`;

  // Ensure persistent volumes for TLS
  await client.post("/volumes/create", { Name: certVolume });
  await client.post("/volumes/create", { Name: dataVolume });

  const result = (await client.post(
    `/containers/create?name=${encodeURIComponent(containerName)}`,
    {
      Image: CADDY_IMAGE,
      ExposedPorts: {
        "80/tcp": {},
        "443/tcp": {},
        "443/udp": {},
        [`${ADMIN_PORT}/tcp`]: {},
      },
      HostConfig: {
        Binds: [`${certVolume}:/data`, `${dataVolume}:/config`],
        PortBindings: {
          "80/tcp": [{ HostPort: "80" }],
          "443/tcp": [{ HostPort: "443" }],
          "443/udp": [{ HostPort: "443" }],
          [`${ADMIN_PORT}/tcp`]: [{ HostPort: String(ADMIN_PORT) }],
        },
        NetworkMode: networkName,
        RestartPolicy: { Name: "always", MaximumRetryCount: 0 },
      },
      NetworkingConfig: {
        EndpointsConfig: {
          [networkName]: { Aliases: ["caddy"] },
        },
      },
    },
  )) as { Id: string };

  await client.post(`/containers/${result.Id}/start`);
}

/** Remove the Caddy proxy container and its volumes. */
export async function removeProxy(
  client: DockerClient,
  containerName: string,
): Promise<void> {
  try {
    await client.post(`/containers/${containerName}/stop?t=5`);
  } catch {
    // Already stopped
  }
  await client.del(`/containers/${containerName}?force=true`);
  await client.del(`/volumes/${containerName}-certs`);
  await client.del(`/volumes/${containerName}-data`);
}
