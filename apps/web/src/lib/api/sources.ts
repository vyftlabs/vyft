import { mutationOptions, queryOptions } from "@tanstack/react-query";
import type { SourceCreate } from "@vyft/spec";
import { queryClient as qc } from "../reactquery";
import { client } from "./client";

const ROOT = ["sources"] as const;

// Mutations invalidate both the source list and the per-resource metrics
// capabilities query — a new/changed source can flip detected kinds.
const invalidateAll = () =>
  Promise.all([
    qc.invalidateQueries({ queryKey: ROOT }),
    qc.invalidateQueries({ queryKey: ["observability", "metricsCapabilities"] }),
  ]);

export const list = queryOptions({
  queryKey: [...ROOT, "list"],
  queryFn: async () => {
    const { data } = await client.GET("/sources", {});
    return data ?? [];
  },
});

export const create = mutationOptions({
  mutationFn: async (body: SourceCreate) => {
    const { data } = await client.POST("/sources", { body });
    return data!;
  },
  onSuccess: invalidateAll,
});

export const patch = mutationOptions({
  mutationFn: async (args: { id: string; body: SourceCreate }) => {
    const { data } = await client.PATCH("/sources/{id}", {
      params: { path: { id: args.id } },
      body: args.body,
    });
    return data!;
  },
  onSuccess: invalidateAll,
});

export const remove = mutationOptions({
  mutationFn: async (id: string) => {
    await client.DELETE("/sources/{id}", { params: { path: { id } } });
  },
  onSuccess: invalidateAll,
});

export const promoteDefault = mutationOptions({
  mutationFn: async (id: string) => {
    const { data } = await client.PUT("/sources/{id}/default", {
      params: { path: { id } },
    });
    return data!;
  },
  onSuccess: invalidateAll,
});

export const test = mutationOptions({
  mutationFn: async (id: string) => {
    const { data } = await client.POST("/sources/{id}/test", {
      params: { path: { id } },
    });
    return data!;
  },
});
