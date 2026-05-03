import { z } from "zod";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import { collectionErrors, ResourceScope } from "../models/common.ts";
import {
  LogLine,
  MetricsOverview,
  ServiceEvent,
} from "../models/observability.ts";

export const observabilityPaths: ZodOpenApiPathsObject = {
  "/projects/{projectId}/resources/{resourceId}/events": {
    get: {
      operationId: "listResourceEvents",
      summary: "Kubernetes events for resource",
      tags: ["Observability"],
      requestParams: { path: ResourceScope },
      responses: {
        200: {
          description: "Events",
          content: { "application/json": { schema: z.array(ServiceEvent) } },
        },
        ...collectionErrors,
      },
    },
  },
  "/projects/{projectId}/resources/{resourceId}/logs": {
    get: {
      operationId: "listResourceLogs",
      summary: "Logs for resource",
      tags: ["Observability"],
      requestParams: {
        path: ResourceScope,
        query: z.object({
          limit: z.coerce.number().int().min(1).max(1000).default(100),
        }),
      },
      responses: {
        200: {
          description: "Log lines",
          content: { "application/json": { schema: z.array(LogLine) } },
        },
        ...collectionErrors,
      },
    },
  },
  "/projects/{projectId}/resources/{resourceId}/metrics": {
    get: {
      operationId: "getResourceMetrics",
      summary: "Metrics overview for resource",
      tags: ["Observability"],
      requestParams: { path: ResourceScope },
      responses: {
        200: {
          description: "Metrics",
          content: { "application/json": { schema: MetricsOverview } },
        },
        ...collectionErrors,
      },
    },
  },
};
