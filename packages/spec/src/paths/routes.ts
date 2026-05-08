import { z } from "zod";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import {
  collectionErrors,
  itemErrors,
  ProjectAndIdScope,
  ResourceScope,
} from "../models/common.ts";
import { Route, RouteCreate, RouteUpdate } from "../models/route.ts";

export const routePaths: ZodOpenApiPathsObject = {
  "/projects/{projectId}/resources/{resourceId}/routes": {
    get: {
      operationId: "listRoutes",
      summary: "List routes for resource",
      tags: ["Routes"],
      requestParams: { path: ResourceScope },
      responses: {
        200: {
          description: "Routes",
          content: { "application/json": { schema: z.array(Route) } },
        },
        ...collectionErrors,
      },
    },
    post: {
      operationId: "createRoute",
      summary: "Create route",
      tags: ["Routes"],
      requestParams: { path: ResourceScope },
      requestBody: { content: { "application/json": { schema: RouteCreate } } },
      responses: {
        201: {
          description: "Created",
          content: { "application/json": { schema: Route } },
        },
        ...collectionErrors,
      },
    },
  },
  "/projects/{projectId}/routes/{id}": {
    patch: {
      operationId: "updateRoute",
      summary: "Update route",
      tags: ["Routes"],
      requestParams: { path: ProjectAndIdScope },
      requestBody: { content: { "application/json": { schema: RouteUpdate } } },
      responses: {
        200: {
          description: "Updated",
          content: { "application/json": { schema: Route } },
        },
        ...itemErrors,
      },
    },
    delete: {
      operationId: "deleteRoute",
      summary: "Delete route",
      tags: ["Routes"],
      requestParams: { path: ProjectAndIdScope },
      responses: {
        204: { description: "Deleted" },
        ...itemErrors,
      },
    },
  },
};
