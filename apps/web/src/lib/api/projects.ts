import { mutationOptions, queryOptions } from "@tanstack/react-query";
import type { Project, ProjectCreate, ProjectUpdate } from "@vyft/spec";
import { delay } from "../mock/latency";
import { now, store, uuid } from "../mock/store";
import { queryClient as qc } from "../reactquery";
import { conflict, notFound } from "./errors";

const ROOT = ["projects"] as const;

export interface ListQuery {
  sort?: "createdAt" | "updatedAt";
  order?: "asc" | "desc";
}

// ─── Service fns (file-local) ────────────────────────────────────────────

async function listProjects(query: ListQuery = {}): Promise<Project[]> {
  await delay();
  const sort = query.sort ?? "createdAt";
  const order = query.order ?? "desc";
  return [...store.read("projects")].sort((a, b) => {
    const cmp = a[sort].localeCompare(b[sort]);
    return order === "asc" ? cmp : -cmp;
  });
}

async function getProject(id: string): Promise<Project> {
  await delay();
  const p = store.read("projects").find((p) => p.id === id);
  if (!p) throw notFound("Project not found");
  return p;
}

async function getProjectBySlug(slug: string): Promise<Project> {
  const list = await listProjects();
  const p = list.find((p) => p.slug === slug);
  if (!p) throw notFound("Project not found");
  return p;
}

async function createProject(body: ProjectCreate): Promise<Project> {
  await delay();
  const existing = store.read("projects").find((p) => p.slug === body.slug);
  if (existing) throw conflict("A project with this slug already exists");

  const project: Project = {
    id: uuid(),
    name: body.name,
    slug: body.slug,
    description: body.description ?? null,
    createdAt: now(),
    updatedAt: now(),
  };
  store.write("projects", [...store.read("projects"), project]);
  return project;
}

async function updateProject(
  id: string,
  body: ProjectUpdate,
): Promise<Project> {
  await delay();
  const list = store.read("projects");
  const idx = list.findIndex((p) => p.id === id);
  if (idx === -1) throw notFound("Project not found");
  const prev = list[idx];
  if (prev === undefined) throw notFound("Project not found");
  const updated: Project = {
    ...prev,
    ...body,
    description:
      body.description !== undefined
        ? (body.description ?? null)
        : prev.description,
    updatedAt: now(),
  };
  const next = [...list];
  next[idx] = updated;
  store.write("projects", next);
  return updated;
}

async function deleteProject(id: string): Promise<void> {
  await delay();
  const project = store.read("projects").find((p) => p.id === id);
  if (!project) throw notFound("Project not found");
  store.write(
    "projects",
    store.read("projects").filter((p) => p.id !== id),
  );
  store.write(
    "resources",
    store.read("resources").filter((r) => r.projectId !== id),
  );
  store.write(
    "variables",
    store.read("variables").filter((v) => v.projectId !== id),
  );
  store.write(
    "deployments",
    store.read("deployments").filter((d) => d.projectId !== id),
  );
}

// ─── Queries ─────────────────────────────────────────────────────────────

export const list = (query: ListQuery = {}) =>
  queryOptions({
    queryKey: [...ROOT, "list", query],
    queryFn: () => listProjects(query),
  });

export const byId = (id: string) =>
  queryOptions({
    queryKey: [...ROOT, id],
    queryFn: () => getProject(id),
  });

export const bySlug = (slug: string) =>
  queryOptions({
    queryKey: [...ROOT, "slug", slug],
    queryFn: () => getProjectBySlug(slug),
  });

// ─── Mutations ───────────────────────────────────────────────────────────

export const create = mutationOptions({
  mutationFn: createProject,
  onSuccess: () => qc.invalidateQueries({ queryKey: ROOT }),
});

export const update = mutationOptions({
  mutationFn: ({ id, body }: { id: string; body: ProjectUpdate }) =>
    updateProject(id, body),
  onSuccess: () => qc.invalidateQueries({ queryKey: ROOT }),
});

export const remove = mutationOptions({
  mutationFn: deleteProject,
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ROOT });
    qc.invalidateQueries({ queryKey: ["resources"] });
    qc.invalidateQueries({ queryKey: ["variables"] });
    qc.invalidateQueries({ queryKey: ["deployments"] });
  },
});
