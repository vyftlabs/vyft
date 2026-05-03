import { z } from "zod";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import { collectionErrors, itemErrors } from "../models/common.ts";
import {
  Project,
  ProjectCreate,
  ProjectListQuery,
  ProjectUpdate,
} from "../models/project.ts";

const IdParam = z.object({ id: z.uuid() });

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
        ...collectionErrors,
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
        ...collectionErrors,
      },
    },
  },
  "/projects/{id}": {
    get: {
      operationId: "getProject",
      summary: "Get project",
      tags: ["Projects"],
      requestParams: { path: IdParam },
      responses: {
        200: {
          description: "Project",
          content: { "application/json": { schema: Project } },
        },
        ...itemErrors,
      },
    },
    patch: {
      operationId: "updateProject",
      summary: "Update project",
      tags: ["Projects"],
      requestParams: { path: IdParam },
      requestBody: {
        content: { "application/json": { schema: ProjectUpdate } },
      },
      responses: {
        200: {
          description: "Updated",
          content: { "application/json": { schema: Project } },
        },
        ...itemErrors,
      },
    },
    delete: {
      operationId: "deleteProject",
      summary: "Delete project",
      tags: ["Projects"],
      requestParams: { path: IdParam },
      responses: {
        204: { description: "Deleted" },
        ...itemErrors,
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
        ...itemErrors,
      },
    },
  },
};
