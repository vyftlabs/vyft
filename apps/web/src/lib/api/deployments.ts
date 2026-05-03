import { mutationOptions, queryOptions } from "@tanstack/react-query";
import type {
  Deployment,
  DeploymentChecksum,
  DeploymentLatest,
} from "@vyft/spec";
import { delay } from "../mock/latency";
import { now, store, uuid } from "../mock/store";
import { queryClient as qc } from "../reactquery";
import { notFound } from "./errors";

const ROOT = ["deployments"] as const;

// ─── Service fns ─────────────────────────────────────────────────────────

function computeChecksum(projectId: string): string {
  const project = store.read("projects").find((p) => p.id === projectId);
  if (!project) return "";
  const resources = store
    .read("resources")
    .filter((r) => r.projectId === projectId);
  const variables = store
    .read("variables")
    .filter((v) => v.projectId === projectId);
  const blob = JSON.stringify({ resources, variables });
  let hash = 0;
  for (let i = 0; i < blob.length; i++) {
    hash = (hash * 31 + blob.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(16);
}

function updateDeployment(id: string, patch: Partial<Deployment>): void {
  const list = store.read("deployments");
  const idx = list.findIndex((d) => d.id === id);
  if (idx === -1) return;
  const next = [...list];
  const row = next[idx];
  if (row === undefined) return;
  next[idx] = { ...row, ...patch };
  store.write("deployments", next);
}

async function getChecksum(projectId: string): Promise<DeploymentChecksum> {
  await delay(50);
  const resources = store
    .read("resources")
    .filter((r) => r.projectId === projectId);
  if (resources.length === 0) return { checksum: null };
  return { checksum: computeChecksum(projectId) };
}

async function getLatest(projectId: string): Promise<DeploymentLatest> {
  await delay(50);
  const list = store
    .read("deployments")
    .filter((d) => d.projectId === projectId && d.status !== "failed")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const latest = list[0];
  if (!latest) return null;
  return {
    checksum: latest.checksum,
    status: latest.status,
    createdAt: latest.createdAt,
  };
}

async function createDeployment(projectId: string): Promise<Deployment> {
  await delay();
  const project = store.read("projects").find((p) => p.id === projectId);
  if (!project) throw notFound("Project not found");

  const checksum = computeChecksum(projectId);
  const ts = now();
  const deployment: Deployment = {
    id: uuid(),
    projectId,
    checksum,
    status: "pending",
    statusMessage: null,
    triggeredBy: null,
    createdAt: ts,
    appliedAt: null,
  };
  store.write("deployments", [...store.read("deployments"), deployment]);

  // Mock lifecycle: pending → applying → applied
  setTimeout(
    () => updateDeployment(deployment.id, { status: "applying" }),
    1000,
  );
  setTimeout(
    () =>
      updateDeployment(deployment.id, {
        status: "applied",
        statusMessage: "Applied",
        appliedAt: now(),
      }),
    3000,
  );

  return deployment;
}

// ─── Queries ─────────────────────────────────────────────────────────────

export const checksum = (projectId: string) =>
  queryOptions({
    queryKey: [...ROOT, projectId, "checksum"],
    queryFn: () => getChecksum(projectId),
  });

export const latest = (projectId: string) =>
  queryOptions({
    queryKey: [...ROOT, projectId, "latest"],
    queryFn: () => getLatest(projectId),
  });

// ─── Mutations ───────────────────────────────────────────────────────────

export const create = mutationOptions({
  mutationFn: ({ projectId }: { projectId: string }) =>
    createDeployment(projectId),
  onSuccess: (_data, { projectId }) => {
    qc.invalidateQueries({ queryKey: [...ROOT, projectId, "latest"] });
  },
});
