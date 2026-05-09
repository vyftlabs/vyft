import { queryOptions } from "@tanstack/react-query";
import { client } from "./client";

const ROOT = ["observability"] as const;

export const events = (projectId: string, resourceId: string) =>
  queryOptions({
    queryKey: [...ROOT, "events", projectId, resourceId],
    queryFn: async () => {
      const { data } = await client.GET(
        "/projects/{projectId}/resources/{resourceId}/events",
        { params: { path: { projectId, resourceId } } },
      );
      return data ?? [];
    },
  });

export const logs = (
  projectId: string,
  resourceId: string,
  limit: number = 100,
) =>
  queryOptions({
    queryKey: [...ROOT, "logs", projectId, resourceId, limit],
    queryFn: async () => {
      const { data } = await client.GET(
        "/projects/{projectId}/resources/{resourceId}/logs",
        { params: { path: { projectId, resourceId }, query: { limit } } },
      );
      return data ?? [];
    },
  });

export const metrics = (projectId: string, resourceId: string) =>
  queryOptions({
    queryKey: [...ROOT, "metrics", projectId, resourceId],
    queryFn: async () => {
      const { data } = await client.GET(
        "/projects/{projectId}/resources/{resourceId}/metrics",
        { params: { path: { projectId, resourceId } } },
      );
      return data!;
    },
  });
