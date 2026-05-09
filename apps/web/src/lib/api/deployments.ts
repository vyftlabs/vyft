import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { queryClient as qc } from "../reactquery";
import { client } from "./client";

const ROOT = ["deployments"] as const;

export const checksum = (projectId: string) =>
  queryOptions({
    queryKey: [...ROOT, projectId, "checksum"],
    queryFn: async () => {
      const { data } = await client.GET(
        "/projects/{projectId}/deployments/checksum",
        { params: { path: { projectId } } },
      );
      return data!;
    },
  });

export const latest = (projectId: string) =>
  queryOptions({
    queryKey: [...ROOT, projectId, "latest"],
    queryFn: async () => {
      const { data } = await client.GET(
        "/projects/{projectId}/deployments/latest",
        { params: { path: { projectId } } },
      );
      return data!;
    },
  });

export const create = mutationOptions({
  mutationFn: async ({ projectId }: { projectId: string }) => {
    const { data } = await client.POST(
      "/projects/{projectId}/deployments",
      { params: { path: { projectId } } },
    );
    return data!;
  },
  onSuccess: (_data, { projectId }) => {
    qc.invalidateQueries({ queryKey: [...ROOT, projectId, "latest"] });
  },
});
