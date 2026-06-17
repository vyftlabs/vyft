import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { queryClient as qc } from "../reactquery";
import { client } from "./client";

const ROOT = ["backups"] as const;

export const list = (projectId: string, resourceId: string) =>
  queryOptions({
    queryKey: [...ROOT, projectId, resourceId],
    // Poll so a running backup advances to completed/failed in the UI.
    refetchInterval: 5_000,
    queryFn: async () => {
      const { data } = await client.GET(
        "/projects/{projectId}/resources/{resourceId}/backups",
        { params: { path: { projectId, resourceId } } },
      );
      return data ?? [];
    },
  });

export const create = mutationOptions({
  mutationFn: async ({
    projectId,
    resourceId,
  }: {
    projectId: string;
    resourceId: string;
  }) => {
    const { data } = await client.POST(
      "/projects/{projectId}/resources/{resourceId}/backups",
      { params: { path: { projectId, resourceId } } },
    );
    return data!;
  },
  onSuccess: (_data, vars) => {
    qc.invalidateQueries({ queryKey: [...ROOT, vars.projectId, vars.resourceId] });
  },
});
