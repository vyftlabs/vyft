import { mutationOptions, queryOptions } from "@tanstack/react-query";
import type { ResourceCreate, ResourceUpdate } from "@vyft/spec";
import { queryClient as qc } from "../reactquery";
import { client } from "./client";

const ROOT = ["resources"] as const;

// Live status arrives via the SSE stream (see status-stream.ts). This slow
// poll is a reconciliation fallback for when the stream is down or a tab was
// backgrounded — it re-syncs the folded-in status without hammering the API.
const STATUS_RECONCILE_MS = 30_000;

export const list = (projectId: string) =>
  queryOptions({
    queryKey: [...ROOT, projectId, "list"],
    refetchInterval: STATUS_RECONCILE_MS,
    queryFn: async () => {
      const { data } = await client.GET("/projects/{projectId}/resources", {
        params: { path: { projectId } },
      });
      return data ?? [];
    },
  });

export const byId = (projectId: string, id: string) =>
  queryOptions({
    queryKey: [...ROOT, projectId, id],
    queryFn: async () => {
      const { data } = await client.GET("/projects/{projectId}/resources/{id}", {
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
    body: ResourceCreate;
  }) => {
    const { data } = await client.POST("/projects/{projectId}/resources", {
      params: { path: { projectId } },
      body,
    });
    return data!;
  },
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ROOT });
    qc.invalidateQueries({ queryKey: ["variables"] });
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
    body: ResourceUpdate;
  }) => {
    const { data } = await client.PATCH("/projects/{projectId}/resources/{id}", {
      params: { path: { projectId, id } },
      body,
    });
    return data!;
  },
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ROOT });
    qc.invalidateQueries({ queryKey: ["deployments"] });
  },
});

export const remove = mutationOptions({
  mutationFn: async ({ projectId, id }: { projectId: string; id: string }) => {
    await client.DELETE("/projects/{projectId}/resources/{id}", {
      params: { path: { projectId, id } },
    });
  },
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ROOT });
    qc.invalidateQueries({ queryKey: ["variables"] });
    qc.invalidateQueries({ queryKey: ["deployments"] });
  },
});
