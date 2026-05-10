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

export const create = mutationOptions({
  mutationFn: async ({ projectId }: { projectId: string }) => {
    const { data } = await client.POST(
      "/projects/{projectId}/deployments",
      { params: { path: { projectId } }, body: {} },
    );
    return data!;
  },
  onSuccess: (_data, { projectId }) => {
    qc.invalidateQueries({ queryKey: [...ROOT, projectId, "list"] });
  },
});
