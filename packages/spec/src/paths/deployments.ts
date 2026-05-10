import { z } from "zod";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import {
  collectionErrors,
  itemErrors,
  ProjectAndIdScope,
  ProjectScope,
} from "../models/common.ts";
import { Deployment, DeploymentCreate } from "../models/deployment.ts";

const ListQuery = z.object({
  environment: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const deploymentPaths: ZodOpenApiPathsObject = {
  "/projects/{projectId}/deployments": {
    get: {
      operationId: "listDeployments",
      summary: "List deployments",
      tags: ["Deployments"],
      requestParams: { path: ProjectScope, query: ListQuery },
      responses: {
        200: {
          description: "Deployments",
          content: { "application/json": { schema: z.array(Deployment) } },
        },
        ...collectionErrors,
      },
    },
    post: {
      operationId: "createDeployment",
      summary: "Trigger deployment",
      tags: ["Deployments"],
      requestParams: { path: ProjectScope },
      requestBody: {
        content: { "application/json": { schema: DeploymentCreate } },
      },
      responses: {
        202: {
          description: "Deployment enqueued",
          content: { "application/json": { schema: Deployment } },
        },
        ...collectionErrors,
      },
    },
  },
  "/projects/{projectId}/deployments/{id}": {
    get: {
      operationId: "getDeployment",
      summary: "Get deployment",
      tags: ["Deployments"],
      requestParams: { path: ProjectAndIdScope },
      responses: {
        200: {
          description: "Deployment",
          content: { "application/json": { schema: Deployment } },
        },
        ...itemErrors,
      },
    },
  },
};
