import { z } from "zod";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import {
  collectionErrors,
  itemErrors,
  ResourceScope,
} from "../models/common.ts";
import {
  LatencyMetrics,
  LogLine,
  LogsCapabilities,
  MetricRange,
  NetworkMetrics,
  RateMetrics,
  ResourceMetrics,
  ServiceEvent,
} from "../models/observability.ts";

// Time-range query params shared by all metric endpoints.
//   from / to = unix milliseconds, inclusive
// Optional — server defaults: from = now-15m, to = now.
const MetricsRangeQuery = z.object({
  from: z.coerce.number().int().optional(),
  to: z.coerce.number().int().optional(),
});

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
  "/projects/{projectId}/resources/{resourceId}/logs/capabilities": {
    get: {
      operationId: "getResourceLogsCapabilities",
      summary: "Detected log capabilities for resource",
      tags: ["Observability"],
      requestParams: { path: ResourceScope },
      responses: {
        200: {
          description: "Capabilities",
          content: { "application/json": { schema: LogsCapabilities } },
        },
        ...collectionErrors,
      },
    },
  },
  "/projects/{projectId}/resources/{resourceId}/logs/tail": {
    get: {
      operationId: "tailResourceLogs",
      summary: "Poll-tail recent log lines",
      tags: ["Observability"],
      requestParams: {
        path: ResourceScope,
        query: z.object({
          sincePollAt: z.iso.datetime().optional(),
          limit: z.coerce.number().int().min(1).max(1000).default(500),
          // Scope to a single deployment's rollout (its pod-template-hash).
          deploymentId: z.uuid().optional(),
        }),
      },
      responses: {
        200: {
          description: "Lines",
          content: { "application/json": { schema: z.array(LogLine) } },
        },
        ...collectionErrors,
      },
    },
  },
  "/projects/{projectId}/resources/{resourceId}/logs/search": {
    get: {
      operationId: "searchResourceLogs",
      summary: "Range search for log lines",
      tags: ["Observability"],
      requestParams: {
        path: ResourceScope,
        query: z.object({
          range: MetricRange.default("15m"),
          query: z.string().max(500).optional(),
          limit: z.coerce.number().int().min(1).max(1000).default(200),
          // Scope to a single deployment's rollout (its pod-template-hash).
          deploymentId: z.uuid().optional(),
        }),
      },
      responses: {
        200: {
          description: "Lines",
          content: { "application/json": { schema: z.array(LogLine) } },
        },
        ...itemErrors,
      },
    },
  },
  "/projects/{projectId}/resources/{resourceId}/metrics/cpu": {
    get: {
      operationId: "getResourceCpuMetrics",
      summary: "CPU usage timeseries, per-pod",
      tags: ["Observability"],
      requestParams: { path: ResourceScope, query: MetricsRangeQuery },
      responses: {
        200: {
          description: "Series",
          content: { "application/json": { schema: ResourceMetrics } },
        },
        ...itemErrors,
      },
    },
  },
  "/projects/{projectId}/resources/{resourceId}/metrics/memory": {
    get: {
      operationId: "getResourceMemoryMetrics",
      summary: "Memory usage timeseries, per-pod",
      tags: ["Observability"],
      requestParams: { path: ResourceScope, query: MetricsRangeQuery },
      responses: {
        200: {
          description: "Series",
          content: { "application/json": { schema: ResourceMetrics } },
        },
        ...itemErrors,
      },
    },
  },
  "/projects/{projectId}/resources/{resourceId}/metrics/disk": {
    get: {
      operationId: "getResourceDiskMetrics",
      summary: "Disk usage timeseries, per-PVC (value=used, limit=capacity)",
      tags: ["Observability"],
      requestParams: { path: ResourceScope, query: MetricsRangeQuery },
      responses: {
        200: {
          description: "Series",
          content: { "application/json": { schema: ResourceMetrics } },
        },
        ...itemErrors,
      },
    },
  },
  "/projects/{projectId}/resources/{resourceId}/metrics/network": {
    get: {
      operationId: "getResourceNetworkMetrics",
      summary: "Network throughput timeseries, per-pod (rx + tx, bytes/sec)",
      tags: ["Observability"],
      requestParams: { path: ResourceScope, query: MetricsRangeQuery },
      responses: {
        200: {
          description: "Series",
          content: { "application/json": { schema: NetworkMetrics } },
        },
        ...itemErrors,
      },
    },
  },
  "/projects/{projectId}/resources/{resourceId}/metrics/requestRate": {
    get: {
      operationId: "getResourceRequestRateMetrics",
      summary: "Request rate timeseries",
      tags: ["Observability"],
      requestParams: { path: ResourceScope, query: MetricsRangeQuery },
      responses: {
        200: {
          description: "Series",
          content: { "application/json": { schema: RateMetrics } },
        },
        ...itemErrors,
      },
    },
  },
  "/projects/{projectId}/resources/{resourceId}/metrics/errorRate": {
    get: {
      operationId: "getResourceErrorRateMetrics",
      summary: "Error rate timeseries (5xx / total, fraction)",
      tags: ["Observability"],
      requestParams: { path: ResourceScope, query: MetricsRangeQuery },
      responses: {
        200: {
          description: "Series",
          content: { "application/json": { schema: RateMetrics } },
        },
        ...itemErrors,
      },
    },
  },
  "/projects/{projectId}/resources/{resourceId}/metrics/latency": {
    get: {
      operationId: "getResourceLatencyMetrics",
      summary: "Latency timeseries with p50/p95/p99 per point",
      tags: ["Observability"],
      requestParams: { path: ResourceScope, query: MetricsRangeQuery },
      responses: {
        200: {
          description: "Series",
          content: { "application/json": { schema: LatencyMetrics } },
        },
        ...itemErrors,
      },
    },
  },
  // Postgres (CNPG) database metrics. connections is resource-shaped
  // (value=active, limit=max_connections); transactions + cacheHit are
  // single aggregate rate series.
  "/projects/{projectId}/resources/{resourceId}/metrics/connections": {
    get: {
      operationId: "getResourceConnectionsMetrics",
      summary: "Postgres connections timeseries (value=active, limit=max)",
      tags: ["Observability"],
      requestParams: { path: ResourceScope, query: MetricsRangeQuery },
      responses: {
        200: {
          description: "Series",
          content: { "application/json": { schema: ResourceMetrics } },
        },
        ...itemErrors,
      },
    },
  },
  "/projects/{projectId}/resources/{resourceId}/metrics/transactions": {
    get: {
      operationId: "getResourceTransactionsMetrics",
      summary: "Postgres transactions/sec timeseries (commits + rollbacks)",
      tags: ["Observability"],
      requestParams: { path: ResourceScope, query: MetricsRangeQuery },
      responses: {
        200: {
          description: "Series",
          content: { "application/json": { schema: RateMetrics } },
        },
        ...itemErrors,
      },
    },
  },
  "/projects/{projectId}/resources/{resourceId}/metrics/dbSize": {
    get: {
      operationId: "getResourceDbSizeMetrics",
      summary: "Postgres database size timeseries (value=used, limit=capacity)",
      tags: ["Observability"],
      requestParams: { path: ResourceScope, query: MetricsRangeQuery },
      responses: {
        200: {
          description: "Series",
          content: { "application/json": { schema: ResourceMetrics } },
        },
        ...itemErrors,
      },
    },
  },
  "/projects/{projectId}/resources/{resourceId}/metrics/redisMemory": {
    get: {
      operationId: "getResourceRedisMemoryMetrics",
      summary: "Redis memory used timeseries (value=used, limit=maxmemory)",
      tags: ["Observability"],
      requestParams: { path: ResourceScope, query: MetricsRangeQuery },
      responses: {
        200: {
          description: "Series",
          content: { "application/json": { schema: ResourceMetrics } },
        },
        ...itemErrors,
      },
    },
  },
  "/projects/{projectId}/resources/{resourceId}/metrics/redisClients": {
    get: {
      operationId: "getResourceRedisClientsMetrics",
      summary: "Redis connected clients timeseries (value=clients, limit=max)",
      tags: ["Observability"],
      requestParams: { path: ResourceScope, query: MetricsRangeQuery },
      responses: {
        200: {
          description: "Series",
          content: { "application/json": { schema: ResourceMetrics } },
        },
        ...itemErrors,
      },
    },
  },
  "/projects/{projectId}/resources/{resourceId}/metrics/redisOps": {
    get: {
      operationId: "getResourceRedisOpsMetrics",
      summary: "Redis commands/sec timeseries",
      tags: ["Observability"],
      requestParams: { path: ResourceScope, query: MetricsRangeQuery },
      responses: {
        200: {
          description: "Series",
          content: { "application/json": { schema: RateMetrics } },
        },
        ...itemErrors,
      },
    },
  },
  "/projects/{projectId}/resources/{resourceId}/metrics/replicationLag": {
    get: {
      operationId: "getResourceReplicationLagMetrics",
      summary: "Postgres replication lag timeseries (seconds, HA only)",
      tags: ["Observability"],
      requestParams: { path: ResourceScope, query: MetricsRangeQuery },
      responses: {
        200: {
          description: "Series",
          content: { "application/json": { schema: RateMetrics } },
        },
        ...itemErrors,
      },
    },
  },
  "/projects/{projectId}/resources/{resourceId}/metrics/cacheHit": {
    get: {
      operationId: "getResourceCacheHitMetrics",
      summary: "Postgres buffer cache hit ratio timeseries (fraction 0..1)",
      tags: ["Observability"],
      requestParams: { path: ResourceScope, query: MetricsRangeQuery },
      responses: {
        200: {
          description: "Series",
          content: { "application/json": { schema: RateMetrics } },
        },
        ...itemErrors,
      },
    },
  },
};
