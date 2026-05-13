import { queryOptions } from "@tanstack/react-query";
import type { MetricKind, MetricRange, MetricSeries } from "@vyft/spec";
import { client } from "./client";

const ROOT = ["observability"] as const;

export const events = (projectId: string, resourceId: string) =>
  queryOptions({
    queryKey: [...ROOT, "events", projectId, resourceId],
    queryFn: async () => {
      const { data } = await client.GET(
        "/projects/{projectId}/resources/{resourceId}/events",
        { params: { path: { projectId, resourceId } } },
      );
      return data ?? [];
    },
  });

export const logs = (
  projectId: string,
  resourceId: string,
  limit: number = 100,
) =>
  queryOptions({
    queryKey: [...ROOT, "logs", projectId, resourceId, limit],
    queryFn: async () => {
      const { data } = await client.GET(
        "/projects/{projectId}/resources/{resourceId}/logs",
        { params: { path: { projectId, resourceId }, query: { limit } } },
      );
      return data ?? [];
    },
  });

export const metrics = (projectId: string, resourceId: string) =>
  queryOptions({
    queryKey: [...ROOT, "metrics", projectId, resourceId],
    queryFn: async () => {
      const { data } = await client.GET(
        "/projects/{projectId}/resources/{resourceId}/metrics",
        { params: { path: { projectId, resourceId } } },
      );
      return data!;
    },
  });

// metricsCapabilities reports which kinds the active metrics source has
// runtime-detected for the instance. Stable for minutes; the 5-minute
// stale window matches the backend's caching budget.
export const metricsCapabilities = (projectId: string, resourceId: string) =>
  queryOptions({
    queryKey: [...ROOT, "metricsCapabilities", projectId, resourceId],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await client.GET(
        "/projects/{projectId}/resources/{resourceId}/metrics/capabilities",
        { params: { path: { projectId, resourceId } } },
      );
      return data!;
    },
  });

// MAX_RING_POINTS = 4 hours at 15s polling; long enough for the metrics-
// server time-series to feel useful without unbounded memory growth.
const MAX_RING_POINTS = 960;

// mergeRing is used by metricsByKind when the source returns a single
// instantaneous point per fetch (metrics-server). React Query keeps the
// previous data via `structuralSharing`; we append the new point and cap
// the buffer.
function mergeRing(prev: MetricSeries | undefined, next: MetricSeries): MetricSeries {
  // Non-latency kinds use `points`; latency uses its own.
  if (next.kind === "latency") {
    if (!prev || prev.kind !== "latency") return next;
    const merged = [...prev.points, ...next.points];
    return {
      ...next,
      points: merged.slice(-MAX_RING_POINTS),
    };
  }
  if (!prev || prev.kind === "latency") return next;
  const merged = [...prev.points, ...next.points];
  return {
    ...next,
    points: merged.slice(-MAX_RING_POINTS),
  };
}

export const metricsByKind = (
  projectId: string,
  resourceId: string,
  kind: MetricKind,
  range: MetricRange = "15m",
) =>
  queryOptions({
    queryKey: [...ROOT, "metricsByKind", projectId, resourceId, kind, range],
    structuralSharing: (oldData, newData) =>
      mergeRing(oldData as MetricSeries | undefined, newData as MetricSeries),
    queryFn: async () => {
      const { data } = await client.GET(
        "/projects/{projectId}/resources/{resourceId}/metrics/{kind}",
        {
          params: {
            path: { projectId, resourceId, kind },
            query: { range },
          },
        },
      );
      return data!;
    },
  });
