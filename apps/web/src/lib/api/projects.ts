import { mutationOptions, queryOptions } from "@tanstack/react-query";
import type { ProjectCreate, ProjectUpdate } from "@vyft/spec";
import { queryClient as qc } from "../reactquery";
import { client } from "./client";

const ROOT = ["projects"] as const;

export interface ListQuery {
  sort?: "createdAt" | "updatedAt";
  order?: "asc" | "desc";
}

export const list = (query: ListQuery = {}) =>
  queryOptions({
    queryKey: [...ROOT, "list", query],
    queryFn: async () => {
      const { data } = await client.GET("/projects", { params: { query } });
      return data ?? [];
    },
  });

export const byId = (id: string) =>
  queryOptions({
    queryKey: [...ROOT, id],
    queryFn: async () => {
      const { data } = await client.GET("/projects/{id}", {
        params: { path: { id } },
      });
      return data!;
    },
  });

export const bySlug = (slug: string) =>
  queryOptions({
    queryKey: [...ROOT, "slug", slug],
    queryFn: async () => {
      const { data } = await client.GET("/projects", {});
      const p = (data ?? []).find((p) => p.slug === slug);
      if (!p) throw new Error("Project not found");
      return p;
    },
  });

export const create = mutationOptions({
  mutationFn: async (body: ProjectCreate) => {
    const { data } = await client.POST("/projects", { body });
    return data!;
  },
  onSuccess: () => qc.invalidateQueries({ queryKey: ROOT }),
});

export const update = mutationOptions({
  mutationFn: async ({ id, body }: { id: string; body: ProjectUpdate }) => {
    const { data } = await client.PATCH("/projects/{id}", {
      params: { path: { id } },
      body,
    });
    return data!;
  },
  onSuccess: () => qc.invalidateQueries({ queryKey: ROOT }),
});

export const remove = mutationOptions({
  mutationFn: async (id: string) => {
    await client.DELETE("/projects/{id}", { params: { path: { id } } });
  },
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ROOT });
    qc.invalidateQueries({ queryKey: ["resources"] });
    qc.invalidateQueries({ queryKey: ["variables"] });
    qc.invalidateQueries({ queryKey: ["deployments"] });
  },
});
