import { mutationOptions, queryOptions } from "@tanstack/react-query";
import type { RegistryCreate } from "@vyft/spec";
import { queryClient as qc } from "../reactquery";
import { client } from "./client";

const ROOT = ["registries"] as const;

export const list = queryOptions({
  queryKey: [...ROOT, "list"],
  queryFn: async () => {
    const { data } = await client.GET("/registries", {});
    return data ?? [];
  },
});

export const create = mutationOptions({
  mutationFn: async (body: RegistryCreate) => {
    const { data } = await client.POST("/registries", { body });
    return data!;
  },
  onSuccess: () => qc.invalidateQueries({ queryKey: ROOT }),
});

export const remove = mutationOptions({
  mutationFn: async (id: string) => {
    await client.DELETE("/registries/{id}", { params: { path: { id } } });
  },
  onSuccess: () => qc.invalidateQueries({ queryKey: ROOT }),
});
