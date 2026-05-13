import { z } from "zod";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import {
  collectionErrors,
  itemErrors,
  ResourceScope,
} from "../models/common.ts";
import {
  LogLine,
  MetricKind,
  MetricRange,
  MetricSeries,
  MetricsCapabilities,
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
  "/projects/{projectId}/resources/{resourceId}/metrics/capabilities": {
    get: {
      operationId: "getResourceMetricsCapabilities",
      summary: "Detected metric kinds for resource",
      tags: ["Observability"],
      requestParams: { path: ResourceScope },
      responses: {
        200: {
          description: "Capabilities",
          content: { "application/json": { schema: MetricsCapabilities } },
        },
        ...collectionErrors,
      },
    },
  },
  "/projects/{projectId}/resources/{resourceId}/metrics/{kind}": {
    get: {
      operationId: "getResourceMetricSeries",
      summary: "Time series for one metric kind",
      tags: ["Observability"],
      requestParams: {
        path: ResourceScope.extend({ kind: MetricKind }),
        query: z.object({ range: MetricRange.default("15m") }),
      },
      responses: {
        200: {
          description: "Series",
          content: { "application/json": { schema: MetricSeries } },
        },
        ...itemErrors,
      },
    },
  },
};
