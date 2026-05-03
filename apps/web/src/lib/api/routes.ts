import { mutationOptions, queryOptions } from "@tanstack/react-query";
import type { Resource, Route, RouteCreate, RouteUpdate } from "@vyft/spec";
import { delay } from "../mock/latency";
import { now, store, uuid } from "../mock/store";
import { queryClient as qc } from "../reactquery";
import { notFound } from "./errors";

const ROOT = ["routes"] as const;

// ─── Service fns ─────────────────────────────────────────────────────────

function findResourceByService(serviceId: string): Resource | undefined {
  return store.read("resources").find((r) => r.service?.id === serviceId);
}

function findResourceContainingRoute(routeId: string): Resource | undefined {
  return store
    .read("resources")
    .find((r) => r.service?.routes?.some((rt) => rt.id === routeId));
}

function writeResource(resource: Resource): void {
  const list = store.read("resources");
  const idx = list.findIndex((r) => r.id === resource.id);
  if (idx === -1) return;
  const next = [...list];
  next[idx] = resource;
  store.write("resources", next);
}

async function listRoutes(
  projectId: string,
  serviceId: string,
): Promise<Route[]> {
  await delay();
  const r = findResourceByService(serviceId);
  if (!r || r.projectId !== projectId) return [];
  return r.service?.routes ?? [];
}

async function createRoute(
  projectId: string,
  serviceId: string,
  body: RouteCreate,
): Promise<Route> {
  await delay();
  const r = findResourceByService(serviceId);
  if (!r || r.projectId !== projectId || !r.service)
    throw notFound("Service not found");
  const route: Route = {
    id: uuid(),
    serviceId,
    domain: body.domain,
    path: body.path,
    pathType: body.pathType ?? "prefix",
    port: body.port,
    tls: body.tls ?? true,
    config: body.config ?? {},
    createdAt: now(),
    updatedAt: now(),
  };
  writeResource({
    ...r,
    service: { ...r.service, routes: [...(r.service.routes ?? []), route] },
  });
  return route;
}

async function updateRoute(
  projectId: string,
  id: string,
  body: RouteUpdate,
): Promise<Route> {
  await delay();
  const r = findResourceContainingRoute(id);
  if (!r || r.projectId !== projectId || !r.service)
    throw notFound("Route not found");
  const list = r.service.routes ?? [];
  const idx = list.findIndex((rt) => rt.id === id);
  if (idx === -1) throw notFound("Route not found");
  const prev = list[idx];
  if (prev === undefined) throw notFound("Route not found");
  const updated: Route = { ...prev, ...body, updatedAt: now() };
  const next = [...list];
  next[idx] = updated;
  writeResource({ ...r, service: { ...r.service, routes: next } });
  return updated;
}

async function deleteRoute(projectId: string, id: string): Promise<void> {
  await delay();
  const r = findResourceContainingRoute(id);
  if (!r || r.projectId !== projectId || !r.service)
    throw notFound("Route not found");
  const next = (r.service.routes ?? []).filter((rt) => rt.id !== id);
  writeResource({ ...r, service: { ...r.service, routes: next } });
}

// ─── Queries ─────────────────────────────────────────────────────────────

export const list = (projectId: string, serviceId: string) =>
  queryOptions({
    queryKey: [...ROOT, projectId, serviceId],
    queryFn: () => listRoutes(projectId, serviceId),
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
    body: RouteCreate;
  }) => createRoute(projectId, serviceId, body),
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ROOT });
    qc.invalidateQueries({ queryKey: ["resources"] });
    qc.invalidateQueries({ queryKey: ["deployments"] });
  },
});

export const update = mutationOptions({
  mutationFn: ({
    projectId,
    id,
    body,
  }: {
    projectId: string;
    id: string;
    body: RouteUpdate;
  }) => updateRoute(projectId, id, body),
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ROOT });
    qc.invalidateQueries({ queryKey: ["resources"] });
    qc.invalidateQueries({ queryKey: ["deployments"] });
  },
});

export const remove = mutationOptions({
  mutationFn: ({ projectId, id }: { projectId: string; id: string }) =>
    deleteRoute(projectId, id),
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ROOT });
    qc.invalidateQueries({ queryKey: ["resources"] });
    qc.invalidateQueries({ queryKey: ["deployments"] });
  },
});
