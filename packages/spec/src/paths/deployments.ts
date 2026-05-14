import { z } from "zod";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import {
  collectionErrors,
  itemErrors,
  ProjectAndIdScope,
  ProjectScope,
  ResourceAndIdScope,
  ResourceScope,
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
  "/projects/{projectId}/discard": {
    post: {
      operationId: "discardProjectChanges",
      summary: "Discard staged project changes",
      description:
        "Reverts all current project state (resources, routes, variables) back to the latest applied deployment. Used to throw away staged changes without deploying. 409 if no applied deployment exists yet.",
      tags: ["Deployments"],
      requestParams: { path: ProjectScope },
      responses: {
        204: { description: "Discarded" },
        ...itemErrors,
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
  "/projects/{projectId}/resources/{resourceId}/deployments": {
    get: {
      operationId: "listResourceDeployments",
      summary: "List deployments that changed a service",
      tags: ["Deployments"],
      requestParams: { path: ResourceScope, query: ListQuery },
      responses: {
        200: {
          description: "Deployments",
          content: { "application/json": { schema: z.array(Deployment) } },
        },
        ...collectionErrors,
      },
    },
  },
  "/projects/{projectId}/resources/{resourceId}/deployments/{id}/restore": {
    post: {
      operationId: "restoreResourceDeployment",
      summary: "Stage service config from this deployment",
      description:
        "Reverts the service's spec, routes, and resource-scoped variables to match this deployment's snapshot. Does not deploy — caller must trigger a deployment afterwards. Secret variable values are not in the snapshot and are preserved as-is when the variable still exists.",
      tags: ["Deployments"],
      requestParams: { path: ResourceAndIdScope },
      responses: {
        204: { description: "Restored" },
        ...itemErrors,
      },
    },
  },
};
