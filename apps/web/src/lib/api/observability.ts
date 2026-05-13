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

export const POLL_INTERVAL_MS = 15_000;

// pointsForRange returns the cap that aligns with the operator-selected
// window at the current poll interval. range=15m + 15s polling = 60.
// Used for both:
// - sizing the metrics-server client-side ring buffer (instant points
//   accumulate to fill the window).
// - bounding the merged buffer when Prom returns a full range each fetch
//   (we still cap as defense-in-depth).
function pointsForRange(range: MetricRange): number {
  const seconds =
    range === "15m" ? 15 * 60
    : range === "1h" ? 60 * 60
    : range === "6h" ? 6 * 60 * 60
    : 24 * 60 * 60;
  return Math.ceil((seconds * 1000) / POLL_INTERVAL_MS);
}

// mergeRing merges a fresh fetch into the previous query data.
// - Range responses (Prom returns N>1 points covering the full window):
//   trust the backend and replace. No accumulation needed; Prom already
//   has the history.
// - Instant responses (metrics-server returns 1 point): append and cap
//   to the operator-selected window's worth of samples.
function mergeRing(
  prev: MetricSeries | undefined,
  next: MetricSeries,
  cap: number,
): MetricSeries {
  if (next.points.length !== 1 || !prev || prev.kind !== next.kind) return next;
  // Same kind by check above; cast bypasses TS's union narrowing
  // limitation across two values.
  return {
    ...next,
    points: [...prev.points, ...next.points].slice(-cap),
  } as MetricSeries;
}

export const metricsByKind = (
  projectId: string,
  resourceId: string,
  kind: MetricKind,
  range: MetricRange = "15m",
) => {
  const cap = pointsForRange(range);
  return queryOptions({
    queryKey: [...ROOT, "metricsByKind", projectId, resourceId, kind, range],
    structuralSharing: (oldData, newData) =>
      mergeRing(
        oldData as MetricSeries | undefined,
        newData as MetricSeries,
        cap,
      ),
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
};
