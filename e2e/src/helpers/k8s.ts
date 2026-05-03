import * as k8s from "@kubernetes/client-node"
import { setTimeout as sleep } from "node:timers/promises"

const CONTEXT_NAME = "kind-vyft-e2e"

function kubeConfig(): k8s.KubeConfig {
  const kc = new k8s.KubeConfig()
  kc.loadFromDefault()
  kc.setCurrentContext(CONTEXT_NAME)
  return kc
}

function appsApi(): k8s.AppsV1Api {
  return kubeConfig().makeApiClient(k8s.AppsV1Api)
}

function coreApi(): k8s.CoreV1Api {
  return kubeConfig().makeApiClient(k8s.CoreV1Api)
}

export async function getDeployment(namespace: string, name: string): Promise<k8s.V1Deployment> {
  return appsApi().readNamespacedDeployment({ name, namespace })
}

export async function getConfigMap(namespace: string, name: string): Promise<k8s.V1ConfigMap> {
  return coreApi().readNamespacedConfigMap({ name, namespace })
}

/**
 * Polls the named Deployment until it reports at least one available replica.
 * "available" means it passed readiness and stayed up past minReadySeconds —
 * the same metric `kubectl get deployment` shows in the AVAILABLE column.
 */
export async function waitForDeploymentReady(
  namespace: string,
  name: string,
  { timeoutMs = 60_000, pollMs = 2_000 }: { timeoutMs?: number; pollMs?: number } = {},
): Promise<void> {
  const api = appsApi()
  const deadline = Date.now() + timeoutMs
  let lastErr: unknown

  while (Date.now() < deadline) {
    try {
      const dep = await api.readNamespacedDeployment({ name, namespace })
      const available = dep.status?.availableReplicas ?? 0
      if (available >= 1) return
      lastErr = new Error(`availableReplicas=${available}`)
    } catch (err) {
      lastErr = err
    }
    await sleep(pollMs)
  }

  throw new Error(
    `Deployment ${namespace}/${name} not ready within ${timeoutMs}ms` +
    (lastErr ? ` (last: ${lastErr instanceof Error ? lastErr.message : String(lastErr)})` : ""),
  )
}
