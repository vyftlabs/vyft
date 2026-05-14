import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { queryClient as qc } from "../reactquery";
import { client } from "./client";

const ROOT = ["deployments"] as const;

export const list = (projectId: string) =>
  queryOptions({
    queryKey: [...ROOT, projectId, "list"],
    queryFn: async () => {
      const { data } = await client.GET(
        "/projects/{projectId}/deployments",
        { params: { path: { projectId } } },
      );
      return data!;
    },
  });

export const listByResource = (projectId: string, resourceId: string) =>
  queryOptions({
    queryKey: [...ROOT, projectId, "byResource", resourceId, "list"],
    queryFn: async () => {
      const { data } = await client.GET(
        "/projects/{projectId}/resources/{resourceId}/deployments",
        { params: { path: { projectId, resourceId } } },
      );
      return data!;
    },
  });

export const byId = (projectId: string, id: string) =>
  queryOptions({
    queryKey: [...ROOT, projectId, "byId", id],
    queryFn: async () => {
      const { data } = await client.GET(
        "/projects/{projectId}/deployments/{id}",
        { params: { path: { projectId, id } } },
      );
      return data!;
    },
  });

export const restoreResource = mutationOptions({
  mutationFn: async ({
    projectId,
    resourceId,
    id,
  }: {
    projectId: string;
    resourceId: string;
    id: string;
  }) => {
    await client.POST(
      "/projects/{projectId}/resources/{resourceId}/deployments/{id}/restore",
      { params: { path: { projectId, resourceId, id } } },
    );
  },
  onSuccess: () => {
    // Invalidate everything that contributes to the deploy-gating hash so the
    // top-level DeployButton lights up immediately after a stage.
    qc.invalidateQueries({ queryKey: ["resources"] });
    qc.invalidateQueries({ queryKey: ["routes"] });
    qc.invalidateQueries({ queryKey: ["variables"] });
    qc.invalidateQueries({ queryKey: ROOT });
  },
});

export const discard = mutationOptions({
  mutationFn: async ({ projectId }: { projectId: string }) => {
    await client.POST(
      "/projects/{projectId}/discard",
      { params: { path: { projectId } } },
    );
  },
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ["resources"] });
    qc.invalidateQueries({ queryKey: ["routes"] });
    qc.invalidateQueries({ queryKey: ["variables"] });
    qc.invalidateQueries({ queryKey: ROOT });
  },
});

export const create = mutationOptions({
  mutationFn: async ({ projectId }: { projectId: string }) => {
    const { data } = await client.POST(
      "/projects/{projectId}/deployments",
      { params: { path: { projectId } }, body: {} },
    );
    return data!;
  },
  onSuccess: (_data, { projectId }) => {
    qc.invalidateQueries({ queryKey: [...ROOT, projectId] });
  },
});
