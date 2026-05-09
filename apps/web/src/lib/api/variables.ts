import { mutationOptions, queryOptions } from "@tanstack/react-query";
import type {
  ResourceVariableCreate,
  ResourceVariableUpdate,
  VariableCreate,
  VariableUpdate,
} from "@vyft/spec";
import { queryClient as qc } from "../reactquery";
import { client } from "./client";

const ROOT = ["variables"] as const;
const PROJECT = [...ROOT, "project"] as const;
const RESOURCE = [...ROOT, "resource"] as const;

// =============================================================================
// Project variables (all — shared + owned, identified by id)
//
// `list` returns every variable in the project. Frontend slices by
// `resourceId` for context: variables page filters `resourceId == null`;
// resource drawer suggestions filter out same-resource owned vars.
// =============================================================================

export const project = {
  list: (projectId: string) =>
    queryOptions({
      queryKey: [...PROJECT, projectId, "list"],
      queryFn: async () => {
        const { data } = await client.GET("/projects/{projectId}/variables", {
          params: { path: { projectId } },
        });
        return data ?? [];
      },
    }),

  byId: (projectId: string, id: string) =>
    queryOptions({
      queryKey: [...PROJECT, projectId, id],
      queryFn: async () => {
        const { data } = await client.GET(
          "/projects/{projectId}/variables/{id}",
          { params: { path: { projectId, id } } },
        );
        return data!;
      },
    }),

  create: mutationOptions({
    mutationFn: async ({
      projectId,
      body,
    }: {
      projectId: string;
      body: VariableCreate;
    }) => {
      const { data } = await client.POST("/projects/{projectId}/variables", {
        params: { path: { projectId } },
        body,
      });
      return data!;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ROOT });
      qc.invalidateQueries({ queryKey: ["deployments"] });
    },
  }),

  update: mutationOptions({
    mutationFn: async ({
      projectId,
      id,
      body,
    }: {
      projectId: string;
      id: string;
      body: VariableUpdate;
    }) => {
      const { data } = await client.PATCH(
        "/projects/{projectId}/variables/{id}",
        { params: { path: { projectId, id } }, body },
      );
      return data!;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ROOT });
      qc.invalidateQueries({ queryKey: ["deployments"] });
    },
  }),

  remove: mutationOptions({
    mutationFn: async ({
      projectId,
      id,
    }: {
      projectId: string;
      id: string;
    }) => {
      await client.DELETE("/projects/{projectId}/variables/{id}", {
        params: { path: { projectId, id } },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ROOT });
      qc.invalidateQueries({ queryKey: ["deployments"] });
    },
  }),
};

// =============================================================================
// Resource env (resource-scoped, owned + imported, identified by key)
// =============================================================================

export const resource = {
  list: (projectId: string, resourceId: string) =>
    queryOptions({
      queryKey: [...RESOURCE, projectId, resourceId, "list"],
      queryFn: async () => {
        const { data } = await client.GET(
          "/projects/{projectId}/resources/{resourceId}/variables",
          { params: { path: { projectId, resourceId } } },
        );
        return data ?? [];
      },
    }),

  byKey: (projectId: string, resourceId: string, key: string) =>
    queryOptions({
      queryKey: [...RESOURCE, projectId, resourceId, key],
      queryFn: async () => {
        const { data } = await client.GET(
          "/projects/{projectId}/resources/{resourceId}/variables/{key}",
          { params: { path: { projectId, resourceId, key } } },
        );
        return data!;
      },
    }),

  create: mutationOptions({
    mutationFn: async ({
      projectId,
      resourceId,
      body,
    }: {
      projectId: string;
      resourceId: string;
      body: ResourceVariableCreate;
    }) => {
      const { data } = await client.POST(
        "/projects/{projectId}/resources/{resourceId}/variables",
        { params: { path: { projectId, resourceId } }, body },
      );
      return data!;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ROOT });
      qc.invalidateQueries({ queryKey: ["deployments"] });
    },
  }),

  update: mutationOptions({
    mutationFn: async ({
      projectId,
      resourceId,
      key,
      body,
    }: {
      projectId: string;
      resourceId: string;
      key: string;
      body: ResourceVariableUpdate;
    }) => {
      const { data } = await client.PATCH(
        "/projects/{projectId}/resources/{resourceId}/variables/{key}",
        { params: { path: { projectId, resourceId, key } }, body },
      );
      return data!;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ROOT });
      qc.invalidateQueries({ queryKey: ["deployments"] });
    },
  }),

  remove: mutationOptions({
    mutationFn: async ({
      projectId,
      resourceId,
      key,
    }: {
      projectId: string;
      resourceId: string;
      key: string;
    }) => {
      await client.DELETE(
        "/projects/{projectId}/resources/{resourceId}/variables/{key}",
        { params: { path: { projectId, resourceId, key } } },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ROOT });
      qc.invalidateQueries({ queryKey: ["deployments"] });
    },
  }),
};
