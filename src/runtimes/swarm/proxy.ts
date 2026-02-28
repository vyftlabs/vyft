import { execFile } from "node:child_process";
import type { CaddyRoute } from "../docker/caddy.ts";
import { generateCaddyConfig } from "../docker/caddy.ts";
import type { DockerClient } from "../docker/client.ts";

const CADDY_IMAGE = "caddy:2-alpine";

function exec(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

/** Deploy or update the Caddy proxy as a Swarm service. */
export async function deploySwarmProxy(
  client: DockerClient,
  serviceName: string,
  networkId: string,
  routes: CaddyRoute[],
): Promise<void> {
  await ensureSwarmProxy(client, serviceName, networkId);

  // Find the running Caddy task container to push config via docker exec
  const config = generateCaddyConfig(routes);
  const payload = JSON.stringify(config);

  // Wait briefly for task container to start
  await new Promise((r) => setTimeout(r, 1000));

  // Find the running container for this service
  const containers = (await client.get(
    `/containers/json?filters=${encodeURIComponent(JSON.stringify({ label: [`com.docker.swarm.service.name=${serviceName}`] }))}`,
  )) as { Id: string }[];

  if (containers.length === 0) {
    throw new Error(
      `No running container found for Swarm service "${serviceName}"`,
    );
  }

  // Use docker exec to push config (admin API isn't published to host)
  await exec("docker", [
    "exec",
    containers[0]?.Id,
    "wget",
    "-q",
    "-O",
    "-",
    "--post-data",
    payload,
    "--header",
    "Content-Type: application/json",
    "http://localhost:2019/load",
  ]);
}

async function ensureSwarmProxy(
  client: DockerClient,
  serviceName: string,
  networkId: string,
): Promise<void> {
  try {
    const services = (await client.get(
      `/services?filters=${encodeURIComponent(JSON.stringify({ name: [serviceName] }))}`,
    )) as { ID: string }[];
    if (services.length > 0) return;
  } catch {
    // Not found
  }

  await client.post("/services/create", {
    Name: serviceName,
    TaskTemplate: {
      ContainerSpec: {
        Image: CADDY_IMAGE,
      },
      RestartPolicy: { Condition: "any" },
      Networks: [{ Target: networkId, Aliases: ["caddy"] }],
    },
    Mode: { Replicated: { Replicas: 1 } },
    EndpointSpec: {
      Ports: [
        { TargetPort: 80, PublishedPort: 80 },
        { TargetPort: 443, PublishedPort: 443 },
      ],
    },
  });
}

/** Remove the Caddy Swarm service. */
export async function removeSwarmProxy(
  client: DockerClient,
  serviceName: string,
): Promise<void> {
  await client.del(`/services/${serviceName}`);
}
