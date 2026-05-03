import { mutationOptions, queryOptions } from "@tanstack/react-query";
import type {
  Resource,
  ResourceCreate,
  ResourcePosition,
  ResourceUpdate,
} from "@vyft/spec";
import { delay } from "../mock/latency";
import { now, store, uuid } from "../mock/store";
import { queryClient as qc } from "../reactquery";
import { conflict, notFound } from "./errors";

const ROOT = ["resources"] as const;

// ─── Service fns ─────────────────────────────────────────────────────────

function buildResource(input: ResourceCreate, projectId: string): Resource {
  const resourceId = uuid();
  const serviceId = uuid();
  const appId = uuid();
  const ts = now();

  return {
    id: resourceId,
    name: input.name,
    type: input.type,
    projectId,
    positionX: input.positionX ?? 0,
    positionY: input.positionY ?? 0,
    createdAt: ts,
    updatedAt: ts,
    service: {
      id: serviceId,
      resourceId,
      type: "app",
      app: {
        id: appId,
        serviceId,
        source: input.source,
        port: input.port ?? null,
        command: input.command ?? null,
        replicas: input.replicas ?? 1,
        compute: input.compute ?? {
          cpuRequest: 100,
          cpuLimit: 500,
          memoryRequest: 128 * 1024 * 1024,
          memoryLimit: 512 * 1024 * 1024,
        },
        healthCheck: input.healthCheck ?? { type: "none" },
        createdAt: ts,
        updatedAt: ts,
      },
      createdAt: ts,
      updatedAt: ts,
      routes: (input.routes ?? []).map((r) => ({
        id: uuid(),
        serviceId,
        domain: r.domain,
        path: r.path,
        pathType: r.pathType ?? "prefix",
        port: r.port,
        tls: r.tls ?? true,
        config: {},
        createdAt: ts,
        updatedAt: ts,
      })),
      volumeMounts: (input.volumes ?? []).map((v) => ({
        id: uuid(),
        mountPath: v.mountPath,
        volume: {
          id: uuid(),
          name: v.name,
          size: v.size,
          mountPath: v.mountPath,
          createdAt: ts,
          updatedAt: ts,
        },
      })),
    },
    variables: [],
  };
}

async function listResources(projectId: string): Promise<Resource[]> {
  await delay();
  return store.read("resources").filter((r) => r.projectId === projectId);
}

async function getResource(projectId: string, id: string): Promise<Resource> {
  await delay();
  const r = store
    .read("resources")
    .find((r) => r.id === id && r.projectId === projectId);
  if (!r) throw notFound("Resource not found");
  return r;
}

async function createResource(
  projectId: string,
  body: ResourceCreate,
): Promise<Resource> {
  await delay();
  const existing = store
    .read("resources")
    .find((r) => r.projectId === projectId && r.name === body.name);
  if (existing) throw conflict("A resource with this name already exists");

  const resource = buildResource(body, projectId);
  store.write("resources", [...store.read("resources"), resource]);

  if (body.variables?.length) {
    const newVars = body.variables.map((v) => ({
      id: uuid(),
      key: v.key,
      value: v.sourceVariableId ? null : (v.value ?? null),
      sensitive: v.sensitive ?? false,
      scope: "resource" as const,
      projectId,
      resourceId: resource.id,
      sourceVariableId: v.sourceVariableId ?? null,
      createdAt: now(),
      updatedAt: now(),
    }));
    store.write("variables", [...store.read("variables"), ...newVars]);
  }

  return resource;
}

async function updateResource(
  projectId: string,
  id: string,
  body: ResourceUpdate,
): Promise<Resource> {
  await delay();
  const list = store.read("resources");
  const idx = list.findIndex((r) => r.id === id && r.projectId === projectId);
  if (idx === -1) throw notFound("Resource not found");

  const r = list[idx];
  if (r === undefined) throw notFound("Resource not found");
  const ts = now();
  const updated: Resource = {
    ...r,
    name: body.name ?? r.name,
    updatedAt: ts,
    service: r.service && {
      ...r.service,
      app: r.service.app && {
        ...r.service.app,
        source: body.source ?? r.service.app.source,
        port:
          body.port !== undefined ? (body.port ?? null) : r.service.app.port,
        command:
          body.command !== undefined
            ? (body.command ?? null)
            : r.service.app.command,
        replicas: body.replicas ?? r.service.app.replicas,
        compute: body.compute ?? r.service.app.compute,
        healthCheck: body.healthCheck ?? r.service.app.healthCheck,
        updatedAt: ts,
      },
    },
  };

  const next = [...list];
  next[idx] = updated;
  store.write("resources", next);
  return updated;
}

async function updateResourcePosition(
  projectId: string,
  id: string,
  body: ResourcePosition,
): Promise<Resource> {
  await delay(50);
  const list = store.read("resources");
  const idx = list.findIndex((r) => r.id === id && r.projectId === projectId);
  if (idx === -1) throw notFound("Resource not found");
  const prev = list[idx];
  if (prev === undefined) throw notFound("Resource not found");
  const updated: Resource = {
    ...prev,
    positionX: body.positionX,
    positionY: body.positionY,
    updatedAt: now(),
  };
  const next = [...list];
  next[idx] = updated;
  store.write("resources", next);
  return updated;
}

async function deleteResource(projectId: string, id: string): Promise<void> {
  await delay();
  const r = store
    .read("resources")
    .find((r) => r.id === id && r.projectId === projectId);
  if (!r) throw notFound("Resource not found");
  store.write(
    "resources",
    store.read("resources").filter((r) => r.id !== id),
  );
  store.write(
    "variables",
    store.read("variables").filter((v) => v.resourceId !== id),
  );
}

// ─── Queries ─────────────────────────────────────────────────────────────

export const list = (projectId: string) =>
  queryOptions({
    queryKey: [...ROOT, projectId, "list"],
    queryFn: () => listResources(projectId),
  });

export const byId = (projectId: string, id: string) =>
  queryOptions({
    queryKey: [...ROOT, projectId, id],
    queryFn: () => getResource(projectId, id),
  });

// ─── Mutations ───────────────────────────────────────────────────────────

export const create = mutationOptions({
  mutationFn: ({
    projectId,
    body,
  }: {
    projectId: string;
    body: ResourceCreate;
  }) => createResource(projectId, body),
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ROOT });
    qc.invalidateQueries({ queryKey: ["variables"] });
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
    body: ResourceUpdate;
  }) => updateResource(projectId, id, body),
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ROOT });
    qc.invalidateQueries({ queryKey: ["deployments"] });
  },
});

export const updatePosition = mutationOptions({
  mutationFn: ({
    projectId,
    id,
    body,
  }: {
    projectId: string;
    id: string;
    body: ResourcePosition;
  }) => updateResourcePosition(projectId, id, body),
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ROOT });
  },
});

export const remove = mutationOptions({
  mutationFn: ({ projectId, id }: { projectId: string; id: string }) =>
    deleteResource(projectId, id),
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ROOT });
    qc.invalidateQueries({ queryKey: ["variables"] });
    qc.invalidateQueries({ queryKey: ["deployments"] });
  },
});
