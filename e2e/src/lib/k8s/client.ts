import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { AppsV1Api, CoreV1Api, KubeConfig } from "@kubernetes/client-node";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const defaultKubeconfig = resolve(repoRoot, ".kube", "config");

export function kubeconfig(path: string = process.env.KUBECONFIG ?? defaultKubeconfig): KubeConfig {
  const kc = new KubeConfig();
  kc.loadFromFile(path);
  return kc;
}

export function core(path?: string): CoreV1Api {
  return kubeconfig(path).makeApiClient(CoreV1Api);
}

export function apps(path?: string): AppsV1Api {
  return kubeconfig(path).makeApiClient(AppsV1Api);
}

export function namespaceFor(slug: string, env = "production"): string {
  return `vyft-${slug}-${env}`;
}
