import { mutationOptions, queryOptions } from "@tanstack/react-query";
import type { Resource, Route, RouteCreate, RouteUpdate } from "@vyft/spec";
import { delay } from "../mock/latency";
import { now, store, uuid } from "../mock/store";
import { queryClient as qc } from "../reactquery";
import { getAppSpec } from "../resource";
import { notFound } from "./errors";

const ROOT = ["routes"] as const;

// ─── Service fns ─────────────────────────────────────────────────────────

function findResourceContainingRoute(routeId: string): Resource | undefined {
  return store
    .read("resources")
    .find((r) => getAppSpec(r)?.routes?.some((rt) => rt.id === routeId));
}

function withRoutes(r: Resource, routes: Route[]): Resource {
  if (r.category !== "service" || r.service.kind !== "app") return r;
  return {
    ...r,
    service: { ...r.service, spec: { ...r.service.spec, routes } },
  };
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
  resourceId: string,
): Promise<Route[]> {
  await delay();
  const r = store
    .read("resources")
    .find((r) => r.id === resourceId && r.projectId === projectId);
  if (!r) return [];
  return getAppSpec(r)?.routes ?? [];
}

async function createRoute(
  projectId: string,
  resourceId: string,
  body: RouteCreate,
): Promise<Route> {
  await delay();
  const r = store
    .read("resources")
    .find((r) => r.id === resourceId && r.projectId === projectId);
  if (!r) throw notFound("Resource not found");
  const spec = getAppSpec(r);
  if (!spec) throw notFound("Resource does not support routes");
  const route: Route = {
    id: uuid(),
    resourceId,
    domain: body.domain,
    path: body.path,
    pathType: body.pathType ?? "prefix",
    port: body.port,
    tls: body.tls ?? true,
    config: body.config ?? {},
    createdAt: now(),
    updatedAt: now(),
  };
  writeResource(withRoutes(r, [...(spec.routes ?? []), route]));
  return route;
}

async function updateRoute(
  projectId: string,
  id: string,
  body: RouteUpdate,
): Promise<Route> {
  await delay();
  const r = findResourceContainingRoute(id);
  if (!r || r.projectId !== projectId) throw notFound("Route not found");
  const spec = getAppSpec(r);
  if (!spec) throw notFound("Route not found");
  const list = spec.routes ?? [];
  const idx = list.findIndex((rt) => rt.id === id);
  if (idx === -1) throw notFound("Route not found");
  const prev = list[idx];
  if (prev === undefined) throw notFound("Route not found");
  const updated: Route = { ...prev, ...body, updatedAt: now() };
  const next = [...list];
  next[idx] = updated;
  writeResource(withRoutes(r, next));
  return updated;
}

async function deleteRoute(projectId: string, id: string): Promise<void> {
  await delay();
  const r = findResourceContainingRoute(id);
  if (!r || r.projectId !== projectId) throw notFound("Route not found");
  const spec = getAppSpec(r);
  if (!spec) throw notFound("Route not found");
  const next = (spec.routes ?? []).filter((rt) => rt.id !== id);
  writeResource(withRoutes(r, next));
}

// ─── Queries ─────────────────────────────────────────────────────────────

export const list = (projectId: string, resourceId: string) =>
  queryOptions({
    queryKey: [...ROOT, projectId, resourceId],
    queryFn: () => listRoutes(projectId, resourceId),
  });

// ─── Mutations ───────────────────────────────────────────────────────────

export const create = mutationOptions({
  mutationFn: ({
    projectId,
    resourceId,
    body,
  }: {
    projectId: string;
    resourceId: string;
    body: RouteCreate;
  }) => createRoute(projectId, resourceId, body),
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
