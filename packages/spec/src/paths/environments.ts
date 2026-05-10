import { z } from "zod";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import {
  collectionErrors,
  itemErrors,
  ProjectAndIdScope,
  ProjectScope,
} from "../models/common.ts";
import {
  Environment,
  EnvironmentCreate,
} from "../models/environment.ts";

export const environmentPaths: ZodOpenApiPathsObject = {
  "/projects/{projectId}/environments": {
    get: {
      operationId: "listEnvironments",
      summary: "List environments",
      tags: ["Environments"],
      requestParams: { path: ProjectScope },
      responses: {
        200: {
          description: "Environments",
          content: { "application/json": { schema: z.array(Environment) } },
        },
        ...collectionErrors,
      },
    },
    post: {
      operationId: "createEnvironment",
      summary: "Create environment",
      tags: ["Environments"],
      requestParams: { path: ProjectScope },
      requestBody: {
        content: { "application/json": { schema: EnvironmentCreate } },
      },
      responses: {
        201: {
          description: "Created",
          content: { "application/json": { schema: Environment } },
        },
        ...collectionErrors,
      },
    },
  },
  "/projects/{projectId}/environments/{id}": {
    get: {
      operationId: "getEnvironment",
      summary: "Get environment",
      tags: ["Environments"],
      requestParams: { path: ProjectAndIdScope },
      responses: {
        200: {
          description: "Environment",
          content: { "application/json": { schema: Environment } },
        },
        ...itemErrors,
      },
    },
    delete: {
      operationId: "deleteEnvironment",
      summary: "Delete environment",
      tags: ["Environments"],
      requestParams: { path: ProjectAndIdScope },
      responses: {
        204: { description: "Deleted" },
        ...itemErrors,
      },
    },
  },
};
