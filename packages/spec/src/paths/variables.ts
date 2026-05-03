import { z } from "zod";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import {
  collectionErrors,
  itemErrors,
  ProjectAndIdScope,
  ProjectScope,
  Uuid,
} from "../models/common.ts";
import {
  Variable,
  VariableCreate,
  VariableReference,
  VariableSuggestions,
  VariableUpdate,
} from "../models/variable.ts";

export const variablePaths: ZodOpenApiPathsObject = {
  "/projects/{projectId}/variables": {
    get: {
      operationId: "listVariables",
      summary: "List variables (shared scope, or filter by resourceId)",
      tags: ["Variables"],
      requestParams: {
        path: ProjectScope,
        query: z.object({ resourceId: Uuid.optional() }),
      },
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
      summary: "Create variable",
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
  "/projects/{projectId}/variables/references": {
    get: {
      operationId: "listVariableReferences",
      summary: "Cross-resource variable references",
      tags: ["Variables"],
      requestParams: { path: ProjectScope },
      responses: {
        200: {
          description: "References",
          content: {
            "application/json": { schema: z.array(VariableReference) },
          },
        },
        ...collectionErrors,
      },
    },
  },
  "/projects/{projectId}/variables/suggestions": {
    get: {
      operationId: "listVariableSuggestions",
      summary: "Suggestions for variable autocomplete",
      tags: ["Variables"],
      requestParams: {
        path: ProjectScope,
        query: z.object({ excludeResourceId: Uuid.optional() }),
      },
      responses: {
        200: {
          description: "Suggestions",
          content: { "application/json": { schema: VariableSuggestions } },
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
};
