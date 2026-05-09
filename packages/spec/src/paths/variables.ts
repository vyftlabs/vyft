import { z } from "zod";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import {
  collectionErrors,
  itemErrors,
  ProjectAndIdScope,
  ProjectScope,
  ResourceScope,
} from "../models/common.ts";
import {
  ResourceVariable,
  ResourceVariableCreate,
  ResourceVariableUpdate,
  Variable,
  VariableCreate,
  VariableUpdate,
} from "../models/variable.ts";

const ResourceKeyScope = z.object({
  projectId: z.uuid(),
  resourceId: z.uuid(),
  key: z.string().min(1).max(255),
});

export const variablePaths: ZodOpenApiPathsObject = {
  // ───────────────────────── Project variables (all) ────────────────────────
  // Returns every variable in the project (shared + owned). Frontend slices
  // by `resourceId` for context-specific views (variables page filters
  // shared; resource drawer suggestions filter out same-resource owned).
  "/projects/{projectId}/variables": {
    get: {
      operationId: "listVariables",
      summary: "List all project variables",
      tags: ["Variables"],
      requestParams: { path: ProjectScope },
      responses: {
        200: {
          description: "Variables",
          content: { "application/json": { schema: z.array(Variable) } },
        },
        ...collectionErrors,
      },
    },
    post: {
      operationId: "createVariable",
      summary: "Create shared variable",
      tags: ["Variables"],
      requestParams: { path: ProjectScope },
      requestBody: {
        content: { "application/json": { schema: VariableCreate } },
      },
      responses: {
        201: {
          description: "Created",
          content: { "application/json": { schema: Variable } },
        },
        ...collectionErrors,
      },
    },
  },
  "/projects/{projectId}/variables/{id}": {
    get: {
      operationId: "getVariable",
      summary: "Get variable",
      tags: ["Variables"],
      requestParams: { path: ProjectAndIdScope },
      responses: {
        200: {
          description: "Variable",
          content: { "application/json": { schema: Variable } },
        },
        ...itemErrors,
      },
    },
    patch: {
      operationId: "updateVariable",
      summary: "Update variable",
      tags: ["Variables"],
      requestParams: { path: ProjectAndIdScope },
      requestBody: {
        content: { "application/json": { schema: VariableUpdate } },
      },
      responses: {
        200: {
          description: "Updated",
          content: { "application/json": { schema: Variable } },
        },
        ...itemErrors,
      },
    },
    delete: {
      operationId: "deleteVariable",
      summary: "Delete variable",
      tags: ["Variables"],
      requestParams: { path: ProjectAndIdScope },
      responses: {
        204: { description: "Deleted" },
        ...itemErrors,
      },
    },
  },

  // ──────────────────── Resource env (owned + imported) ─────────────────────
  "/projects/{projectId}/resources/{resourceId}/variables": {
    get: {
      operationId: "listResourceVariables",
      summary: "List resource env vars (owned + imported)",
      tags: ["Variables"],
      requestParams: { path: ResourceScope },
      responses: {
        200: {
          description: "Variables",
          content: {
            "application/json": { schema: z.array(ResourceVariable) },
          },
        },
        ...collectionErrors,
      },
    },
    post: {
      operationId: "createResourceVariable",
      summary: "Create resource env var (owned or imported)",
      tags: ["Variables"],
      requestParams: { path: ResourceScope },
      requestBody: {
        content: { "application/json": { schema: ResourceVariableCreate } },
      },
      responses: {
        201: {
          description: "Created",
          content: { "application/json": { schema: ResourceVariable } },
        },
        ...collectionErrors,
      },
    },
  },
  "/projects/{projectId}/resources/{resourceId}/variables/{key}": {
    get: {
      operationId: "getResourceVariable",
      summary: "Get resource env var by key",
      tags: ["Variables"],
      requestParams: { path: ResourceKeyScope },
      responses: {
        200: {
          description: "Variable",
          content: { "application/json": { schema: ResourceVariable } },
        },
        ...itemErrors,
      },
    },
    patch: {
      operationId: "updateResourceVariable",
      summary: "Update resource env var",
      tags: ["Variables"],
      requestParams: { path: ResourceKeyScope },
      requestBody: {
        content: { "application/json": { schema: ResourceVariableUpdate } },
      },
      responses: {
        200: {
          description: "Updated",
          content: { "application/json": { schema: ResourceVariable } },
        },
        ...itemErrors,
      },
    },
    delete: {
      operationId: "deleteResourceVariable",
      summary: "Delete resource env var",
      tags: ["Variables"],
      requestParams: { path: ResourceKeyScope },
      responses: {
        204: { description: "Deleted" },
        ...itemErrors,
      },
    },
  },
};
