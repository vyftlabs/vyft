import { spawn } from "node:child_process";
import type { K8sClient } from "./client.ts";

const REGISTRY_NS = "vyft-registry";
const REGISTRY_NAME = "registry";
const REGISTRY_PORT = 5000;
const LOCAL_PORT = 5000;

/** Ensure an in-cluster registry Deployment + Service in its own namespace. */
export async function ensureK8sRegistry(client: K8sClient): Promise<{
  local: string;
  cluster: string;
}> {
  // Ensure namespace
  try {
    await client.readNamespace({ name: REGISTRY_NS });
  } catch {
    await client.createNamespace({
      body: {
        metadata: {
          name: REGISTRY_NS,
          labels: { "app.kubernetes.io/managed-by": "vyft" },
        },
      },
    });
  }

  // Ensure Deployment
  try {
    await client.readDeployment({
      namespace: REGISTRY_NS,
      name: REGISTRY_NAME,
    });
  } catch {
    await client.createDeployment({
      namespace: REGISTRY_NS,
      body: {
        metadata: { name: REGISTRY_NAME, namespace: REGISTRY_NS },
        spec: {
          replicas: 1,
          selector: { matchLabels: { app: REGISTRY_NAME } },
          template: {
            metadata: { labels: { app: REGISTRY_NAME } },
            spec: {
              containers: [
                {
                  name: REGISTRY_NAME,
                  image: "registry:2",
                  ports: [{ containerPort: REGISTRY_PORT }],
                },
              ],
            },
          },
        },
      },
    });
  }

  // Ensure Service
  try {
    await client.readService({ namespace: REGISTRY_NS, name: REGISTRY_NAME });
  } catch {
    await client.createService({
      namespace: REGISTRY_NS,
      body: {
        metadata: { name: REGISTRY_NAME, namespace: REGISTRY_NS },
        spec: {
          selector: { app: REGISTRY_NAME },
          ports: [{ port: REGISTRY_PORT, targetPort: REGISTRY_PORT }],
        },
      },
    });
  }

  return {
    local: `localhost:${LOCAL_PORT}`,
    cluster: `${REGISTRY_NAME}.${REGISTRY_NS}.svc.cluster.local:${REGISTRY_PORT}`,
  };
}

/** Start a port-forward to the registry. Returns a kill function. */
export function portForwardRegistry(): { kill: () => void } {
  const child = spawn(
    "kubectl",
    [
      "port-forward",
      "-n",
      REGISTRY_NS,
      `svc/${REGISTRY_NAME}`,
      `${LOCAL_PORT}:${REGISTRY_PORT}`,
    ],
    { stdio: "ignore", detached: true },
  );

  child.unref();
  return {
    kill: () => {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
    },
  };
}
