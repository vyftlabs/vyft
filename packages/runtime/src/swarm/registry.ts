import type { DockerClient } from "../docker/client.ts";

const REGISTRY_SERVICE = "vyft-registry";
const REGISTRY_PORT = 5000;

/** Ensure an in-cluster registry is running as a Swarm service. */
export async function ensureRegistry(client: DockerClient): Promise<string> {
  try {
    const services = (await client.get(
      `/services?filters=${encodeURIComponent(JSON.stringify({ name: [REGISTRY_SERVICE] }))}`,
    )) as { ID: string }[];
    if (services.length > 0) return `127.0.0.1:${REGISTRY_PORT}`;
  } catch {
    // Not found, create
  }

  await client.post("/services/create", {
    Name: REGISTRY_SERVICE,
    TaskTemplate: {
      ContainerSpec: {
        Image: "registry:2",
      },
      RestartPolicy: { Condition: "any" },
    },
    Mode: { Replicated: { Replicas: 1 } },
    EndpointSpec: {
      Ports: [{ TargetPort: REGISTRY_PORT, PublishedPort: REGISTRY_PORT }],
    },
  });

  return `127.0.0.1:${REGISTRY_PORT}`;
}

/** Remove the registry service. */
export async function removeRegistry(client: DockerClient): Promise<void> {
  await client.del(`/services/${REGISTRY_SERVICE}`);
}
