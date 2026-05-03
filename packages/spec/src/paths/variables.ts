import { z } from "zod"
import type { ZodOpenApiPathsObject } from "zod-openapi"
import { errorResponses, Uuid } from "../models/common.ts"
import {
  Variable,
  VariableCreate,
  VariableUpdate,
} from "../models/variable.ts"

const ProjectScope = z.object({ projectId: Uuid })
const VariableScope = z.object({ projectId: Uuid, id: Uuid })

const VariableReference = z.object({
  sourceResourceId: Uuid,
  targetResourceId: Uuid,
}).meta({ id: "VariableReference" })

const SuggestionShared = z.object({
  id: Uuid,
  key: z.string(),
  secret: z.boolean(),
}).meta({ id: "SuggestionShared" })

const SuggestionService = z.object({
  id: Uuid,
  key: z.string(),
  secret: z.boolean(),
  resourceName: z.string().optional(),
  resourceImage: z.string().optional(),
}).meta({ id: "SuggestionService" })

const SuggestionBuiltin = z.object({
  id: z.string(),
  key: z.string(),
  token: z.string(),
  secret: z.boolean(),
  resourceName: z.string(),
  resourceImage: z.string().optional(),
}).meta({ id: "SuggestionBuiltin" })

const VariableSuggestions = z.object({
  shared: z.array(SuggestionShared),
  service: z.array(SuggestionService),
  builtin: z.array(SuggestionBuiltin),
}).meta({ id: "VariableSuggestions" })

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
        200: { description: "Variables", content: { "application/json": { schema: z.array(Variable) } } },
        ...errorResponses,
      },
    },
    post: {
      operationId: "createVariable",
      summary: "Create variable",
      tags: ["Variables"],
      requestParams: { path: ProjectScope },
      requestBody: { content: { "application/json": { schema: VariableCreate } } },
      responses: {
        201: { description: "Created", content: { "application/json": { schema: Variable } } },
        ...errorResponses,
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
        200: { description: "References", content: { "application/json": { schema: z.array(VariableReference) } } },
        ...errorResponses,
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
        200: { description: "Suggestions", content: { "application/json": { schema: VariableSuggestions } } },
        ...errorResponses,
      },
    },
  },
  "/projects/{projectId}/variables/{id}": {
    get: {
      operationId: "getVariable",
      summary: "Get variable",
      tags: ["Variables"],
      requestParams: { path: VariableScope },
      responses: {
        200: { description: "Variable", content: { "application/json": { schema: Variable } } },
        ...errorResponses,
      },
    },
    patch: {
      operationId: "updateVariable",
      summary: "Update variable",
      tags: ["Variables"],
      requestParams: { path: VariableScope },
      requestBody: { content: { "application/json": { schema: VariableUpdate } } },
      responses: {
        200: { description: "Updated", content: { "application/json": { schema: Variable } } },
        ...errorResponses,
      },
    },
    delete: {
      operationId: "deleteVariable",
      summary: "Delete variable",
      tags: ["Variables"],
      requestParams: { path: VariableScope },
      responses: {
        204: { description: "Deleted" },
        ...errorResponses,
      },
    },
  },
}
