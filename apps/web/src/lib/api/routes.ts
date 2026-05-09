import { mutationOptions, queryOptions } from "@tanstack/react-query";
import type { RouteCreate, RouteUpdate } from "@vyft/spec";
import { queryClient as qc } from "../reactquery";
import { client } from "./client";

const ROOT = ["routes"] as const;

export const list = (projectId: string) =>
  queryOptions({
    queryKey: [...ROOT, projectId, "list"],
    queryFn: async () => {
      const { data } = await client.GET("/projects/{projectId}/routes", {
        params: { path: { projectId } },
      });
      return data ?? [];
    },
  });

export const byId = (projectId: string, id: string) =>
  queryOptions({
    queryKey: [...ROOT, projectId, id],
    queryFn: async () => {
      const { data } = await client.GET("/projects/{projectId}/routes/{id}", {
        params: { path: { projectId, id } },
      });
      return data!;
    },
  });

export const create = mutationOptions({
  mutationFn: async ({
    projectId,
    body,
  }: {
    projectId: string;
    body: RouteCreate;
  }) => {
    const { data } = await client.POST("/projects/{projectId}/routes", {
      params: { path: { projectId } },
      body,
    });
    return data!;
  },
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ROOT });
    qc.invalidateQueries({ queryKey: ["resources"] });
    qc.invalidateQueries({ queryKey: ["deployments"] });
  },
});

export const update = mutationOptions({
  mutationFn: async ({
    projectId,
    id,
    body,
  }: {
    projectId: string;
    id: string;
    body: RouteUpdate;
  }) => {
    const { data } = await client.PATCH("/projects/{projectId}/routes/{id}", {
      params: { path: { projectId, id } },
      body,
    });
    return data!;
  },
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ROOT });
    qc.invalidateQueries({ queryKey: ["resources"] });
    qc.invalidateQueries({ queryKey: ["deployments"] });
  },
});

export const remove = mutationOptions({
  mutationFn: async ({ projectId, id }: { projectId: string; id: string }) => {
    await client.DELETE("/projects/{projectId}/routes/{id}", {
      params: { path: { projectId, id } },
    });
  },
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ROOT });
    qc.invalidateQueries({ queryKey: ["resources"] });
    qc.invalidateQueries({ queryKey: ["deployments"] });
  },
});
