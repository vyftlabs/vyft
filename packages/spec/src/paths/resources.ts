import { z } from "zod";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import {
  collectionErrors,
  itemErrors,
  ProjectAndIdScope,
  ProjectScope,
} from "../models/common.ts";
import {
  Resource,
  ResourceCreate,
  ResourceUpdate,
} from "../models/resource.ts";

export const resourcePaths: ZodOpenApiPathsObject = {
  "/projects/{projectId}/resources": {
    get: {
      operationId: "listResources",
      summary: "List resources in project",
      tags: ["Resources"],
      requestParams: { path: ProjectScope },
      responses: {
        200: {
          description: "Resources",
          content: { "application/json": { schema: z.array(Resource) } },
        },
        ...collectionErrors,
      },
    },
    post: {
      operationId: "createResource",
      summary: "Create resource",
      tags: ["Resources"],
      requestParams: { path: ProjectScope },
      requestBody: {
        content: { "application/json": { schema: ResourceCreate } },
      },
      responses: {
        201: {
          description: "Created",
          content: { "application/json": { schema: Resource } },
        },
        ...collectionErrors,
      },
    },
  },
  "/projects/{projectId}/resources/{id}": {
    get: {
      operationId: "getResource",
      summary: "Get resource",
      tags: ["Resources"],
      requestParams: { path: ProjectAndIdScope },
      responses: {
        200: {
          description: "Resource",
          content: { "application/json": { schema: Resource } },
        },
        ...itemErrors,
      },
    },
    patch: {
      operationId: "updateResource",
      summary: "Update resource",
      tags: ["Resources"],
      requestParams: { path: ProjectAndIdScope },
      requestBody: {
        content: { "application/json": { schema: ResourceUpdate } },
      },
      responses: {
        200: {
          description: "Updated",
          content: { "application/json": { schema: Resource } },
        },
        ...itemErrors,
      },
    },
    delete: {
      operationId: "deleteResource",
      summary: "Delete resource",
      tags: ["Resources"],
      requestParams: { path: ProjectAndIdScope },
      responses: {
        204: { description: "Deleted" },
        ...itemErrors,
      },
    },
  },
};
