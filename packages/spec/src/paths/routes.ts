import { z } from "zod";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import {
  collectionErrors,
  itemErrors,
  ProjectAndIdScope,
  ProjectScope,
} from "../models/common.ts";
import { Route, RouteCreate, RouteUpdate } from "../models/route.ts";

export const routePaths: ZodOpenApiPathsObject = {
  "/projects/{projectId}/routes": {
    get: {
      operationId: "listRoutes",
      summary: "List routes in project",
      tags: ["Routes"],
      requestParams: { path: ProjectScope },
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
      requestParams: { path: ProjectScope },
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
    get: {
      operationId: "getRoute",
      summary: "Get route",
      tags: ["Routes"],
      requestParams: { path: ProjectAndIdScope },
      responses: {
        200: {
          description: "Route",
          content: { "application/json": { schema: Route } },
        },
        ...itemErrors,
      },
    },
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
