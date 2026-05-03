import { z } from "zod";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import {
  collectionErrors,
  itemErrors,
  ProjectAndIdScope,
  ServiceScope,
} from "../models/common.ts";
import { Route, RouteCreate, RouteUpdate } from "../models/route.ts";

export const routePaths: ZodOpenApiPathsObject = {
  "/projects/{projectId}/services/{serviceId}/routes": {
    get: {
      operationId: "listRoutes",
      summary: "List routes for service",
      tags: ["Routes"],
      requestParams: { path: ServiceScope },
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
      requestParams: { path: ServiceScope },
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
