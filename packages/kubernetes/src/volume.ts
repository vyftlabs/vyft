import type { VolumeConfig } from "@vyft/core";
import type { K8sClient } from "./client.ts";

/** Create a PersistentVolumeClaim. */
export async function createPVC(
  client: K8sClient,
  namespace: string,
  name: string,
  config: VolumeConfig,
): Promise<void> {
  await client.createPVC({
    namespace,
    body: {
      metadata: {
        name,
        labels: { "app.kubernetes.io/managed-by": "vyft" },
      },
      spec: {
        accessModes: ["ReadWriteOnce"],
        resources: {
          requests: {
            storage: config.size ?? "1Gi",
          },
        },
      },
    },
  });
}

/** Delete a PVC. */
export async function deletePVC(
  client: K8sClient,
  namespace: string,
  name: string,
): Promise<void> {
  try {
    await client.deletePVC({ namespace, name });
  } catch (err: unknown) {
    if (!isNotFound(err)) throw err;
  }
}

function isNotFound(err: unknown): boolean {
  if (typeof err === "object" && err !== null) {
    const e = err as Record<string, unknown>;
    if (e["statusCode"] === 404 || e["code"] === 404) return true;
    if (typeof e["response"] === "object" && e["response"] !== null) {
      const resp = e["response"] as Record<string, unknown>;
      if (resp["statusCode"] === 404) return true;
    }
  }
  return false;
}
