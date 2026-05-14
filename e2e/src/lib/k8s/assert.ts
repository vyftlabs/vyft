import { expect } from "@playwright/test";

import type { ProjectHandle } from "../types.ts";
import { core } from "./client.ts";

export type PodAssertion = {
  resource: string;
  image?: string;
  phase?: "Running" | "Pending" | "Succeeded" | "Failed" | "Unknown";
  /** Optional: secret names that must appear in `imagePullSecrets`. */
  pullSecrets?: string[];
};

export type RegistrySecretAssertion = {
  /** Logical registry name as configured in Vyft (becomes `vyft-registry-{name}`). */
  registry: string;
};

/** Assert the project namespace exists and carries the project label. */
export async function namespace(project: ProjectHandle, timeoutMs = 30_000): Promise<void> {
  const api = core();
  await expect
    .poll(
      async () => {
        try {
          const ns = await api.readNamespace({ name: project.namespace });
          return ns.metadata?.labels?.["vyft.dev/project"] ?? null;
        } catch {
          return null;
        }
      },
      { timeout: timeoutMs, intervals: [500, 1_000, 2_000] },
    )
    .toBe(project.slug);
}

/** Assert a pod exists for the resource and is in the expected phase (default Running). */
export async function pod(project: ProjectHandle, input: PodAssertion, timeoutMs = 120_000): Promise<void> {
  const api = core();
  const wantPhase = input.phase ?? "Running";

  await expect
    .poll(
      async () => {
        const pods = await api.listNamespacedPod({
          namespace: project.namespace,
          labelSelector: `vyft.dev/resource=${input.resource}`,
        });
        const p = pods.items[0];
        if (!p) return null;
        if (input.image && p.spec?.containers?.[0]?.image !== input.image) return null;
        return p.status?.phase ?? null;
      },
      { timeout: timeoutMs, intervals: [1_000, 2_000] },
    )
    .toBe(wantPhase);

  if (input.pullSecrets?.length) {
    const pods = await api.listNamespacedPod({
      namespace: project.namespace,
      labelSelector: `vyft.dev/resource=${input.resource}`,
    });
    const refs = (pods.items[0]?.spec?.imagePullSecrets ?? []).map((r) => r.name).filter(Boolean);
    for (const name of input.pullSecrets) {
      expect(refs).toContain(name);
    }
  }
}

/**
 * Assert the dockerconfigjson Secret materialized for a registry in the
 * project namespace. Backend creates these at deploy time (one per registry
 * referenced by any resource in the project).
 */
export async function registrySecret(
  project: ProjectHandle,
  input: RegistrySecretAssertion,
  timeoutMs = 30_000,
): Promise<void> {
  const api = core();
  const name = registrySecretName(input.registry);

  await expect
    .poll(
      async () => {
        try {
          const sec = await api.readNamespacedSecret({ name, namespace: project.namespace });
          return sec.type ?? null;
        } catch {
          return null;
        }
      },
      { timeout: timeoutMs, intervals: [500, 1_000, 2_000] },
    )
    .toBe("kubernetes.io/dockerconfigjson");

  const sec = await api.readNamespacedSecret({ name, namespace: project.namespace });
  expect(sec.metadata?.labels?.["vyft.dev/project"]).toBe(project.slug);
}

/** Backend convention: `vyft-registry-{name}`. */
export function registrySecretName(registry: string): string {
  return `vyft-registry-${registry}`;
}
