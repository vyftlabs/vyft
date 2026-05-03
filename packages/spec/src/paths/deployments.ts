import { z } from "zod"
import type { ZodOpenApiPathsObject } from "zod-openapi"
import { errorResponses, Uuid } from "../models/common.ts"
import {
  Deployment,
  DeploymentChecksum,
  DeploymentLatest,
} from "../models/deployment.ts"

const ProjectScope = z.object({ projectId: Uuid })

export const deploymentPaths: ZodOpenApiPathsObject = {
  "/projects/{projectId}/deployments": {
    post: {
      operationId: "createDeployment",
      summary: "Trigger deployment",
      tags: ["Deployments"],
      requestParams: { path: ProjectScope },
      responses: {
        201: { description: "Deployment enqueued", content: { "application/json": { schema: Deployment } } },
        ...errorResponses,
      },
    },
  },
  "/projects/{projectId}/deployments/checksum": {
    get: {
      operationId: "getDeploymentChecksum",
      summary: "Current snapshot checksum",
      tags: ["Deployments"],
      requestParams: { path: ProjectScope },
      responses: {
        200: { description: "Checksum", content: { "application/json": { schema: DeploymentChecksum } } },
        ...errorResponses,
      },
    },
  },
  "/projects/{projectId}/deployments/latest": {
    get: {
      operationId: "getLatestDeployment",
      summary: "Latest non-failed deployment",
      tags: ["Deployments"],
      requestParams: { path: ProjectScope },
      responses: {
        200: { description: "Latest", content: { "application/json": { schema: DeploymentLatest } } },
        ...errorResponses,
      },
    },
  },
}
