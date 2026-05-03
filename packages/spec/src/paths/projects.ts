import { z } from "zod";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import { errorResponses, Uuid } from "../models/common.ts";
import {
  Project,
  ProjectCreate,
  ProjectListQuery,
  ProjectUpdate,
} from "../models/project.ts";

export const projectPaths: ZodOpenApiPathsObject = {
  "/projects": {
    get: {
      operationId: "listProjects",
      summary: "List projects",
      tags: ["Projects"],
      requestParams: { query: ProjectListQuery },
      responses: {
        200: {
          description: "Projects",
          content: { "application/json": { schema: z.array(Project) } },
        },
        ...errorResponses,
      },
    },
    post: {
      operationId: "createProject",
      summary: "Create project",
      tags: ["Projects"],
      requestBody: {
        content: { "application/json": { schema: ProjectCreate } },
      },
      responses: {
        201: {
          description: "Created",
          content: { "application/json": { schema: Project } },
        },
        ...errorResponses,
      },
    },
  },
  "/projects/{id}": {
    get: {
      operationId: "getProject",
      summary: "Get project",
      tags: ["Projects"],
      requestParams: { path: z.object({ id: Uuid }) },
      responses: {
        200: {
          description: "Project",
          content: { "application/json": { schema: Project } },
        },
        ...errorResponses,
      },
    },
    patch: {
      operationId: "updateProject",
      summary: "Update project",
      tags: ["Projects"],
      requestParams: { path: z.object({ id: Uuid }) },
      requestBody: {
        content: { "application/json": { schema: ProjectUpdate } },
      },
      responses: {
        200: {
          description: "Updated",
          content: { "application/json": { schema: Project } },
        },
        ...errorResponses,
      },
    },
    delete: {
      operationId: "deleteProject",
      summary: "Delete project",
      tags: ["Projects"],
      requestParams: { path: z.object({ id: Uuid }) },
      responses: {
        204: { description: "Deleted" },
        ...errorResponses,
      },
    },
  },
  "/projects/by-slug/{slug}": {
    get: {
      operationId: "getProjectBySlug",
      summary: "Get project by slug",
      tags: ["Projects"],
      requestParams: { path: z.object({ slug: z.string() }) },
      responses: {
        200: {
          description: "Project",
          content: { "application/json": { schema: Project } },
        },
        ...errorResponses,
      },
    },
  },
};
