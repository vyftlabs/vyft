import { mutationOptions, queryOptions } from "@tanstack/react-query";
import type { Resource, Volume, VolumeCreate } from "@vyft/spec";
import { delay } from "../mock/latency";
import { now, store, uuid } from "../mock/store";
import { queryClient as qc } from "../reactquery";
import { notFound } from "./errors";

const ROOT = ["volumes"] as const;

// ─── Service fns ─────────────────────────────────────────────────────────

function findResourceByService(serviceId: string): Resource | undefined {
  return store.read("resources").find((r) => r.service?.id === serviceId);
}

function findResourceContainingVolume(volumeId: string): Resource | undefined {
  return store
    .read("resources")
    .find((r) =>
      r.service?.volumeMounts?.some((vm) => vm.volume.id === volumeId),
    );
}

function writeResource(resource: Resource): void {
  const list = store.read("resources");
  const idx = list.findIndex((r) => r.id === resource.id);
  if (idx === -1) return;
  const next = [...list];
  next[idx] = resource;
  store.write("resources", next);
}

async function listVolumes(
  projectId: string,
  serviceId: string,
): Promise<Volume[]> {
  await delay();
  const r = findResourceByService(serviceId);
  if (!r || r.projectId !== projectId) return [];
  return (r.service?.volumeMounts ?? []).map((vm) => ({
    ...vm.volume,
    mountPath: vm.mountPath,
  }));
}

async function createVolume(
  projectId: string,
  serviceId: string,
  body: VolumeCreate,
): Promise<Volume> {
  await delay();
  const r = findResourceByService(serviceId);
  if (!r || r.projectId !== projectId || !r.service)
    throw notFound("Service not found");
  const ts = now();
  const volume: Volume = {
    id: uuid(),
    name: body.name,
    size: body.size,
    mountPath: body.mountPath,
    createdAt: ts,
    updatedAt: ts,
  };
  const mount = { id: uuid(), mountPath: body.mountPath, volume };
  writeResource({
    ...r,
    service: {
      ...r.service,
      volumeMounts: [...(r.service.volumeMounts ?? []), mount],
    },
  });
  return volume;
}

async function deleteVolume(projectId: string, id: string): Promise<void> {
  await delay();
  const r = findResourceContainingVolume(id);
  if (!r || r.projectId !== projectId || !r.service)
    throw notFound("Volume not found");
  const next = (r.service.volumeMounts ?? []).filter(
    (vm) => vm.volume.id !== id,
  );
  writeResource({ ...r, service: { ...r.service, volumeMounts: next } });
}

// ─── Queries ─────────────────────────────────────────────────────────────

export const list = (projectId: string, serviceId: string) =>
  queryOptions({
    queryKey: [...ROOT, projectId, serviceId],
    queryFn: () => listVolumes(projectId, serviceId),
  });

// ─── Mutations ───────────────────────────────────────────────────────────

export const create = mutationOptions({
  mutationFn: ({
    projectId,
    serviceId,
    body,
  }: {
    projectId: string;
    serviceId: string;
    body: VolumeCreate;
  }) => createVolume(projectId, serviceId, body),
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ROOT });
    qc.invalidateQueries({ queryKey: ["resources"] });
    qc.invalidateQueries({ queryKey: ["deployments"] });
  },
});

export const remove = mutationOptions({
  mutationFn: ({ projectId, id }: { projectId: string; id: string }) =>
    deleteVolume(projectId, id),
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ROOT });
    qc.invalidateQueries({ queryKey: ["resources"] });
    qc.invalidateQueries({ queryKey: ["deployments"] });
  },
});
