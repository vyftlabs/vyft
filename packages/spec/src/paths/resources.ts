import { z } from "zod"
import type { ZodOpenApiPathsObject } from "zod-openapi"
import { errorResponses, Uuid } from "../models/common.ts"
import {
  Resource,
  ResourceCreate,
  ResourceUpdate,
  ResourcePosition,
} from "../models/resource.ts"

const ProjectScope = z.object({ projectId: Uuid })
const ProjectAndResource = z.object({ projectId: Uuid, id: Uuid })

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
        ...errorResponses,
      },
    },
    post: {
      operationId: "createResource",
      summary: "Create resource",
      tags: ["Resources"],
      requestParams: { path: ProjectScope },
      requestBody: { content: { "application/json": { schema: ResourceCreate } } },
      responses: {
        201: { description: "Created", content: { "application/json": { schema: Resource } } },
        ...errorResponses,
      },
    },
  },
  "/projects/{projectId}/resources/{id}": {
    get: {
      operationId: "getResource",
      summary: "Get resource",
      tags: ["Resources"],
      requestParams: { path: ProjectAndResource },
      responses: {
        200: { description: "Resource", content: { "application/json": { schema: Resource } } },
        ...errorResponses,
      },
    },
    patch: {
      operationId: "updateResource",
      summary: "Update resource",
      tags: ["Resources"],
      requestParams: { path: ProjectAndResource },
      requestBody: { content: { "application/json": { schema: ResourceUpdate } } },
      responses: {
        200: { description: "Updated", content: { "application/json": { schema: Resource } } },
        ...errorResponses,
      },
    },
    delete: {
      operationId: "deleteResource",
      summary: "Delete resource",
      tags: ["Resources"],
      requestParams: { path: ProjectAndResource },
      responses: {
        204: { description: "Deleted" },
        ...errorResponses,
      },
    },
  },
  "/projects/{projectId}/resources/{id}/position": {
    patch: {
      operationId: "updateResourcePosition",
      summary: "Update resource position",
      tags: ["Resources"],
      requestParams: { path: ProjectAndResource },
      requestBody: { content: { "application/json": { schema: ResourcePosition } } },
      responses: {
        200: { description: "Updated", content: { "application/json": { schema: Resource } } },
        ...errorResponses,
      },
    },
  },
}
