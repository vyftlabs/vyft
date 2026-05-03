import { mutationOptions, queryOptions } from "@tanstack/react-query";
import type { Registry, RegistryCreate } from "@vyft/spec";
import { delay } from "../mock/latency";
import { now, store, uuid } from "../mock/store";
import { queryClient as qc } from "../reactquery";
import { notFound } from "./errors";

const ROOT = ["registries"] as const;

// ─── Service fns ─────────────────────────────────────────────────────────

async function listRegistries(): Promise<Registry[]> {
  await delay();
  return [...store.read("registries")].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
}

async function createRegistry(body: RegistryCreate): Promise<Registry> {
  await delay();
  const ts = now();
  const r: Registry = {
    id: uuid(),
    name: body.name,
    url: body.url,
    username: body.username,
    createdAt: ts,
    updatedAt: ts,
  };
  store.write("registries", [...store.read("registries"), r]);
  return r;
}

async function deleteRegistry(id: string): Promise<void> {
  await delay();
  const r = store.read("registries").find((r) => r.id === id);
  if (!r) throw notFound("Registry not found");
  store.write(
    "registries",
    store.read("registries").filter((r) => r.id !== id),
  );
}

// ─── Queries ─────────────────────────────────────────────────────────────

export const list = queryOptions({
  queryKey: [...ROOT, "list"],
  queryFn: () => listRegistries(),
});

// ─── Mutations ───────────────────────────────────────────────────────────

export const create = mutationOptions({
  mutationFn: createRegistry,
  onSuccess: () => qc.invalidateQueries({ queryKey: ROOT }),
});

export const remove = mutationOptions({
  mutationFn: deleteRegistry,
  onSuccess: () => qc.invalidateQueries({ queryKey: ROOT }),
});
