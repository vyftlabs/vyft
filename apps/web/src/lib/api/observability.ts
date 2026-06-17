import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import type {
  LatencyMetrics,
  LogLine,
  MetricRange,
  NetworkMetrics,
  RateMetrics,
  ResourceMetrics,
} from "@vyft/spec";
import { client } from "./client";
import { ApiError } from "./errors";

// is404 detects "kind not detected for this resource" so metric queries
// can return empty data instead of throwing. Avoids retry storms + noisy
// console logging for the common "this source doesn't have latency for
// postgres" case.
function is404(err: unknown): boolean {
  if (err instanceof ApiError) return err.code === "NOT_FOUND";
  if (typeof err === "object" && err !== null && "code" in err) {
    return (err as { code: unknown }).code === "NOT_FOUND";
  }
  return false;
}

const ROOT = ["observability"] as const;

export const POLL_INTERVAL_MS = 5_000;

export const events = (projectId: string, resourceId: string) =>
  queryOptions({
    queryKey: [...ROOT, "events", projectId, resourceId],
    // Live updates arrive via SSE (events-stream.ts); this slow poll is a
    // reconciliation fallback when the stream is unavailable.
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data } = await client.GET(
        "/projects/{projectId}/resources/{resourceId}/events",
        { params: { path: { projectId, resourceId } } },
      );
      return data ?? [];
    },
  });

export const logsCapabilities = (projectId: string, resourceId: string) =>
  queryOptions({
    queryKey: [...ROOT, "logsCapabilities", projectId, resourceId],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await client.GET(
        "/projects/{projectId}/resources/{resourceId}/logs/capabilities",
        { params: { path: { projectId, resourceId } } },
      );
      return data!;
    },
  });

const MAX_TAIL_LINES = 2000;

// mergeTailLines appends new lines to the ring and caps at
// MAX_TAIL_LINES. De-dups by timestamp+message to handle the
// inclusive-bound case where the same line could surface on adjacent polls.
function mergeTailLines(prev: LogLine[], next: LogLine[]): LogLine[] {
  if (!prev?.length) return next.slice(-MAX_TAIL_LINES);
  if (!next?.length) return prev;
  const seen = new Set(prev.map((l) => l.timestamp + "|" + l.message));
  const dedup = next.filter((l) => !seen.has(l.timestamp + "|" + l.message));
  return [...prev, ...dedup].slice(-MAX_TAIL_LINES);
}

export const logsTail = (
  projectId: string,
  resourceId: string,
  deploymentId?: string,
) =>
  queryOptions({
    queryKey: [...ROOT, "logsTail", projectId, resourceId, deploymentId ?? null],
    structuralSharing: (oldData, newData) => {
      const prev = (oldData as LogLine[] | undefined) ?? [];
      const next = (newData as LogLine[] | undefined) ?? [];
      return mergeTailLines(prev, next);
    },
    queryFn: async (ctx) => {
      const cached = ctx.client?.getQueryData<LogLine[]>([
        ...ROOT,
        "logsTail",
        projectId,
        resourceId,
        deploymentId ?? null,
      ]);
      const lastSeen =
        cached && cached.length > 0
          ? cached[cached.length - 1]?.timestamp
          : undefined;
      const { data } = await client.GET(
        "/projects/{projectId}/resources/{resourceId}/logs/tail",
        {
          params: {
            path: { projectId, resourceId },
            query: {
              ...(lastSeen ? { sincePollAt: lastSeen } : {}),
              ...(deploymentId ? { deploymentId } : {}),
            },
          },
        },
      );
      return data ?? [];
    },
  });

export const logsSearch = (
  projectId: string,
  resourceId: string,
  range: MetricRange = "15m",
  query: string = "",
  deploymentId?: string,
) =>
  queryOptions({
    queryKey: [
      ...ROOT,
      "logsSearch",
      projectId,
      resourceId,
      range,
      query,
      deploymentId ?? null,
    ],
    queryFn: async () => {
      const { data } = await client.GET(
        "/projects/{projectId}/resources/{resourceId}/logs/search",
        {
          params: {
            path: { projectId, resourceId },
            query: {
              range,
              ...(query ? { query } : {}),
              ...(deploymentId ? { deploymentId } : {}),
            },
          },
        },
      );
      return data ?? [];
    },
  });

// ── Metrics: 5 per-kind endpoints + incremental polling via from/to ──
//
// Each query opens with a backfill (from = now - DISPLAY_WINDOW_MS, no `to`)
// then advances `from` to lastSeen+1 on subsequent polls. Server returns
// only points strictly newer than `from`. structuralSharing merges into
// the existing cache.

// Display window controls how far back the initial backfill reaches.
// Subsequent polls only fetch deltas. The overview slots use the default;
// the detailed Metrics tab passes a wider window (1h/6h/24h) keyed into
// the query so each range gets its own cache + backfill.
const DISPLAY_WINDOW_MS = 15 * 60 * 1000;

interface PointWithTimestamp {
  timestamp: number;
}

interface SeriesWithPoints<P extends PointWithTimestamp> {
  id?: string;
  points: P[];
}

interface MetricsResponse<P extends PointWithTimestamp> {
  series: SeriesWithPoints<P>[];
}

// mergeSeries merges a fresh delta response into the cached one.
// Aligned by series.id; new series are added; existing series get their
// points concatenated (dedup by timestamp, newest wins).
function mergeSeries<P extends PointWithTimestamp>(
  prev: MetricsResponse<P> | undefined,
  next: MetricsResponse<P>,
): MetricsResponse<P> {
  if (!prev) return next;
  const byId = new Map<string, SeriesWithPoints<P>>();
  for (const s of prev.series) byId.set(s.id ?? "", { ...s, points: [...s.points] });
  for (const s of next.series) {
    const key = s.id ?? "";
    const existing = byId.get(key);
    if (!existing) {
      byId.set(key, { ...s, points: [...s.points] });
      continue;
    }
    // Append new points, dedup by timestamp.
    const seen = new Set(existing.points.map((p) => p.timestamp));
    for (const p of s.points) {
      if (!seen.has(p.timestamp)) existing.points.push(p);
    }
    existing.points.sort((a, b) => a.timestamp - b.timestamp);
  }
  return { series: Array.from(byId.values()) };
}

// latestTimestamp scans all series and returns the most recent point
// time, or null if the cache is empty.
function latestTimestamp<P extends PointWithTimestamp>(
  data: MetricsResponse<P> | undefined,
): number | null {
  if (!data) return null;
  let max = -Infinity;
  for (const s of data.series) {
    for (const p of s.points) if (p.timestamp > max) max = p.timestamp;
  }
  return Number.isFinite(max) ? max : null;
}

// buildRangeQuery returns the {from?, to?} query params for the next poll.
// First call (no cache): from = now - DISPLAY_WINDOW_MS. Subsequent calls:
// from = lastTimestamp + 1. `to` always omitted — server defaults to now.
function buildRangeQuery<P extends PointWithTimestamp>(
  cached: MetricsResponse<P> | undefined,
  windowMs: number,
): { from?: number } {
  const last = latestTimestamp(cached);
  if (last !== null) return { from: last + 1 };
  return { from: Date.now() - windowMs };
}

export const cpuMetrics = (
  projectId: string,
  resourceId: string,
  windowMs: number = DISPLAY_WINDOW_MS,
) =>
  queryOptions({
    queryKey: [...ROOT, "cpu", projectId, resourceId, windowMs],
    placeholderData: keepPreviousData,
    refetchInterval: (q: { state: { error: unknown } }) =>
      is404(q.state.error) ? false : POLL_INTERVAL_MS,
    retry: (_count: number, err: unknown) => !is404(err),
    structuralSharing: (oldData, newData) =>
      mergeSeries(
        oldData as ResourceMetrics | undefined,
        newData as ResourceMetrics,
      ),
    queryFn: async (ctx) => {
      const cached = ctx.client?.getQueryData<ResourceMetrics>([
        ...ROOT,
        "cpu",
        projectId,
        resourceId,
        windowMs,
      ]);
      const { data } = await client.GET(
        "/projects/{projectId}/resources/{resourceId}/metrics/cpu",
        {
          params: {
            path: { projectId, resourceId },
            query: buildRangeQuery(cached, windowMs),
          },
        },
      );
      return data!;
    },
  });

export const memoryMetrics = (
  projectId: string,
  resourceId: string,
  windowMs: number = DISPLAY_WINDOW_MS,
) =>
  queryOptions({
    queryKey: [...ROOT, "memory", projectId, resourceId, windowMs],
    placeholderData: keepPreviousData,
    refetchInterval: (q: { state: { error: unknown } }) =>
      is404(q.state.error) ? false : POLL_INTERVAL_MS,
    retry: (_count: number, err: unknown) => !is404(err),
    structuralSharing: (oldData, newData) =>
      mergeSeries(
        oldData as ResourceMetrics | undefined,
        newData as ResourceMetrics,
      ),
    queryFn: async (ctx) => {
      const cached = ctx.client?.getQueryData<ResourceMetrics>([
        ...ROOT,
        "memory",
        projectId,
        resourceId,
        windowMs,
      ]);
      const { data } = await client.GET(
        "/projects/{projectId}/resources/{resourceId}/metrics/memory",
        {
          params: {
            path: { projectId, resourceId },
            query: buildRangeQuery(cached, windowMs),
          },
        },
      );
      return data!;
    },
  });

export const diskMetrics = (
  projectId: string,
  resourceId: string,
  windowMs: number = DISPLAY_WINDOW_MS,
) =>
  queryOptions({
    queryKey: [...ROOT, "disk", projectId, resourceId, windowMs],
    placeholderData: keepPreviousData,
    refetchInterval: (q: { state: { error: unknown } }) =>
      is404(q.state.error) ? false : POLL_INTERVAL_MS,
    retry: (_count: number, err: unknown) => !is404(err),
    structuralSharing: (oldData, newData) =>
      mergeSeries(
        oldData as ResourceMetrics | undefined,
        newData as ResourceMetrics,
      ),
    queryFn: async (ctx) => {
      const cached = ctx.client?.getQueryData<ResourceMetrics>([
        ...ROOT,
        "disk",
        projectId,
        resourceId,
        windowMs,
      ]);
      const { data } = await client.GET(
        "/projects/{projectId}/resources/{resourceId}/metrics/disk",
        {
          params: {
            path: { projectId, resourceId },
            query: buildRangeQuery(cached, windowMs),
          },
        },
      );
      return data!;
    },
  });

export const networkMetrics = (
  projectId: string,
  resourceId: string,
  windowMs: number = DISPLAY_WINDOW_MS,
) =>
  queryOptions({
    queryKey: [...ROOT, "network", projectId, resourceId, windowMs],
    placeholderData: keepPreviousData,
    refetchInterval: (q: { state: { error: unknown } }) =>
      is404(q.state.error) ? false : POLL_INTERVAL_MS,
    retry: (_count: number, err: unknown) => !is404(err),
    structuralSharing: (oldData, newData) =>
      mergeSeries(
        oldData as NetworkMetrics | undefined,
        newData as NetworkMetrics,
      ),
    queryFn: async (ctx) => {
      const cached = ctx.client?.getQueryData<NetworkMetrics>([
        ...ROOT,
        "network",
        projectId,
        resourceId,
        windowMs,
      ]);
      const { data } = await client.GET(
        "/projects/{projectId}/resources/{resourceId}/metrics/network",
        {
          params: {
            path: { projectId, resourceId },
            query: buildRangeQuery(cached, windowMs),
          },
        },
      );
      return data!;
    },
  });

export const requestRateMetrics = (
  projectId: string,
  resourceId: string,
  windowMs: number = DISPLAY_WINDOW_MS,
) =>
  queryOptions({
    queryKey: [...ROOT, "requestRate", projectId, resourceId, windowMs],
    placeholderData: keepPreviousData,
    refetchInterval: (q: { state: { error: unknown } }) =>
      is404(q.state.error) ? false : POLL_INTERVAL_MS,
    retry: (_count: number, err: unknown) => !is404(err),
    structuralSharing: (oldData, newData) =>
      mergeSeries(
        oldData as RateMetrics | undefined,
        newData as RateMetrics,
      ),
    queryFn: async (ctx) => {
      const cached = ctx.client?.getQueryData<RateMetrics>([
        ...ROOT,
        "requestRate",
        projectId,
        resourceId,
        windowMs,
      ]);
      const { data } = await client.GET(
        "/projects/{projectId}/resources/{resourceId}/metrics/requestRate",
        {
          params: {
            path: { projectId, resourceId },
            query: buildRangeQuery(cached, windowMs),
          },
        },
      );
      return data!;
    },
  });

export const errorRateMetrics = (
  projectId: string,
  resourceId: string,
  windowMs: number = DISPLAY_WINDOW_MS,
) =>
  queryOptions({
    queryKey: [...ROOT, "errorRate", projectId, resourceId, windowMs],
    placeholderData: keepPreviousData,
    refetchInterval: (q: { state: { error: unknown } }) =>
      is404(q.state.error) ? false : POLL_INTERVAL_MS,
    retry: (_count: number, err: unknown) => !is404(err),
    structuralSharing: (oldData, newData) =>
      mergeSeries(
        oldData as RateMetrics | undefined,
        newData as RateMetrics,
      ),
    queryFn: async (ctx) => {
      const cached = ctx.client?.getQueryData<RateMetrics>([
        ...ROOT,
        "errorRate",
        projectId,
        resourceId,
        windowMs,
      ]);
      const { data } = await client.GET(
        "/projects/{projectId}/resources/{resourceId}/metrics/errorRate",
        {
          params: {
            path: { projectId, resourceId },
            query: buildRangeQuery(cached, windowMs),
          },
        },
      );
      return data!;
    },
  });

export const latencyMetrics = (
  projectId: string,
  resourceId: string,
  windowMs: number = DISPLAY_WINDOW_MS,
) =>
  queryOptions({
    queryKey: [...ROOT, "latency", projectId, resourceId, windowMs],
    placeholderData: keepPreviousData,
    refetchInterval: (q: { state: { error: unknown } }) =>
      is404(q.state.error) ? false : POLL_INTERVAL_MS,
    retry: (_count: number, err: unknown) => !is404(err),
    structuralSharing: (oldData, newData) =>
      mergeSeries(
        oldData as LatencyMetrics | undefined,
        newData as LatencyMetrics,
      ),
    queryFn: async (ctx) => {
      const cached = ctx.client?.getQueryData<LatencyMetrics>([
        ...ROOT,
        "latency",
        projectId,
        resourceId,
        windowMs,
      ]);
      const { data } = await client.GET(
        "/projects/{projectId}/resources/{resourceId}/metrics/latency",
        {
          params: {
            path: { projectId, resourceId },
            query: buildRangeQuery(cached, windowMs),
          },
        },
      );
      return data!;
    },
  });

// ── Postgres (CNPG) database metrics ──────────────────────────────────

export const connectionsMetrics = (
  projectId: string,
  resourceId: string,
  windowMs: number = DISPLAY_WINDOW_MS,
) =>
  queryOptions({
    queryKey: [...ROOT, "connections", projectId, resourceId, windowMs],
    placeholderData: keepPreviousData,
    refetchInterval: (q: { state: { error: unknown } }) =>
      is404(q.state.error) ? false : POLL_INTERVAL_MS,
    retry: (_count: number, err: unknown) => !is404(err),
    structuralSharing: (oldData, newData) =>
      mergeSeries(
        oldData as ResourceMetrics | undefined,
        newData as ResourceMetrics,
      ),
    queryFn: async (ctx) => {
      const cached = ctx.client?.getQueryData<ResourceMetrics>([
        ...ROOT,
        "connections",
        projectId,
        resourceId,
        windowMs,
      ]);
      const { data } = await client.GET(
        "/projects/{projectId}/resources/{resourceId}/metrics/connections",
        {
          params: {
            path: { projectId, resourceId },
            query: buildRangeQuery(cached, windowMs),
          },
        },
      );
      return data!;
    },
  });

export const dbSizeMetrics = (
  projectId: string,
  resourceId: string,
  windowMs: number = DISPLAY_WINDOW_MS,
) =>
  queryOptions({
    queryKey: [...ROOT, "dbSize", projectId, resourceId, windowMs],
    placeholderData: keepPreviousData,
    refetchInterval: (q: { state: { error: unknown } }) =>
      is404(q.state.error) ? false : POLL_INTERVAL_MS,
    retry: (_count: number, err: unknown) => !is404(err),
    structuralSharing: (oldData, newData) =>
      mergeSeries(
        oldData as ResourceMetrics | undefined,
        newData as ResourceMetrics,
      ),
    queryFn: async (ctx) => {
      const cached = ctx.client?.getQueryData<ResourceMetrics>([
        ...ROOT,
        "dbSize",
        projectId,
        resourceId,
        windowMs,
      ]);
      const { data } = await client.GET(
        "/projects/{projectId}/resources/{resourceId}/metrics/dbSize",
        {
          params: {
            path: { projectId, resourceId },
            query: buildRangeQuery(cached, windowMs),
          },
        },
      );
      return data!;
    },
  });

export const transactionsMetrics = (
  projectId: string,
  resourceId: string,
  windowMs: number = DISPLAY_WINDOW_MS,
) =>
  queryOptions({
    queryKey: [...ROOT, "transactions", projectId, resourceId, windowMs],
    placeholderData: keepPreviousData,
    refetchInterval: (q: { state: { error: unknown } }) =>
      is404(q.state.error) ? false : POLL_INTERVAL_MS,
    retry: (_count: number, err: unknown) => !is404(err),
    structuralSharing: (oldData, newData) =>
      mergeSeries(oldData as RateMetrics | undefined, newData as RateMetrics),
    queryFn: async (ctx) => {
      const cached = ctx.client?.getQueryData<RateMetrics>([
        ...ROOT,
        "transactions",
        projectId,
        resourceId,
        windowMs,
      ]);
      const { data } = await client.GET(
        "/projects/{projectId}/resources/{resourceId}/metrics/transactions",
        {
          params: {
            path: { projectId, resourceId },
            query: buildRangeQuery(cached, windowMs),
          },
        },
      );
      return data!;
    },
  });

export const replicationLagMetrics = (
  projectId: string,
  resourceId: string,
  windowMs: number = DISPLAY_WINDOW_MS,
) =>
  queryOptions({
    queryKey: [...ROOT, "replicationLag", projectId, resourceId, windowMs],
    placeholderData: keepPreviousData,
    refetchInterval: (q: { state: { error: unknown } }) =>
      is404(q.state.error) ? false : POLL_INTERVAL_MS,
    retry: (_count: number, err: unknown) => !is404(err),
    structuralSharing: (oldData, newData) =>
      mergeSeries(oldData as RateMetrics | undefined, newData as RateMetrics),
    queryFn: async (ctx) => {
      const cached = ctx.client?.getQueryData<RateMetrics>([
        ...ROOT,
        "replicationLag",
        projectId,
        resourceId,
        windowMs,
      ]);
      const { data } = await client.GET(
        "/projects/{projectId}/resources/{resourceId}/metrics/replicationLag",
        {
          params: {
            path: { projectId, resourceId },
            query: buildRangeQuery(cached, windowMs),
          },
        },
      );
      return data!;
    },
  });

export const cacheHitMetrics = (
  projectId: string,
  resourceId: string,
  windowMs: number = DISPLAY_WINDOW_MS,
) =>
  queryOptions({
    queryKey: [...ROOT, "cacheHit", projectId, resourceId, windowMs],
    placeholderData: keepPreviousData,
    refetchInterval: (q: { state: { error: unknown } }) =>
      is404(q.state.error) ? false : POLL_INTERVAL_MS,
    retry: (_count: number, err: unknown) => !is404(err),
    structuralSharing: (oldData, newData) =>
      mergeSeries(oldData as RateMetrics | undefined, newData as RateMetrics),
    queryFn: async (ctx) => {
      const cached = ctx.client?.getQueryData<RateMetrics>([
        ...ROOT,
        "cacheHit",
        projectId,
        resourceId,
        windowMs,
      ]);
      const { data } = await client.GET(
        "/projects/{projectId}/resources/{resourceId}/metrics/cacheHit",
        {
          params: {
            path: { projectId, resourceId },
            query: buildRangeQuery(cached, windowMs),
          },
        },
      );
      return data!;
    },
  });

// ── Redis (redis_exporter) database metrics ───────────────────────────

export const redisMemoryMetrics = (
  projectId: string,
  resourceId: string,
  windowMs: number = DISPLAY_WINDOW_MS,
) =>
  queryOptions({
    queryKey: [...ROOT, "redisMemory", projectId, resourceId, windowMs],
    placeholderData: keepPreviousData,
    refetchInterval: (q: { state: { error: unknown } }) =>
      is404(q.state.error) ? false : POLL_INTERVAL_MS,
    retry: (_count: number, err: unknown) => !is404(err),
    structuralSharing: (oldData, newData) =>
      mergeSeries(
        oldData as ResourceMetrics | undefined,
        newData as ResourceMetrics,
      ),
    queryFn: async (ctx) => {
      const cached = ctx.client?.getQueryData<ResourceMetrics>([
        ...ROOT,
        "redisMemory",
        projectId,
        resourceId,
        windowMs,
      ]);
      const { data } = await client.GET(
        "/projects/{projectId}/resources/{resourceId}/metrics/redisMemory",
        {
          params: {
            path: { projectId, resourceId },
            query: buildRangeQuery(cached, windowMs),
          },
        },
      );
      return data!;
    },
  });

export const redisClientsMetrics = (
  projectId: string,
  resourceId: string,
  windowMs: number = DISPLAY_WINDOW_MS,
) =>
  queryOptions({
    queryKey: [...ROOT, "redisClients", projectId, resourceId, windowMs],
    placeholderData: keepPreviousData,
    refetchInterval: (q: { state: { error: unknown } }) =>
      is404(q.state.error) ? false : POLL_INTERVAL_MS,
    retry: (_count: number, err: unknown) => !is404(err),
    structuralSharing: (oldData, newData) =>
      mergeSeries(
        oldData as ResourceMetrics | undefined,
        newData as ResourceMetrics,
      ),
    queryFn: async (ctx) => {
      const cached = ctx.client?.getQueryData<ResourceMetrics>([
        ...ROOT,
        "redisClients",
        projectId,
        resourceId,
        windowMs,
      ]);
      const { data } = await client.GET(
        "/projects/{projectId}/resources/{resourceId}/metrics/redisClients",
        {
          params: {
            path: { projectId, resourceId },
            query: buildRangeQuery(cached, windowMs),
          },
        },
      );
      return data!;
    },
  });

export const redisOpsMetrics = (
  projectId: string,
  resourceId: string,
  windowMs: number = DISPLAY_WINDOW_MS,
) =>
  queryOptions({
    queryKey: [...ROOT, "redisOps", projectId, resourceId, windowMs],
    placeholderData: keepPreviousData,
    refetchInterval: (q: { state: { error: unknown } }) =>
      is404(q.state.error) ? false : POLL_INTERVAL_MS,
    retry: (_count: number, err: unknown) => !is404(err),
    structuralSharing: (oldData, newData) =>
      mergeSeries(oldData as RateMetrics | undefined, newData as RateMetrics),
    queryFn: async (ctx) => {
      const cached = ctx.client?.getQueryData<RateMetrics>([
        ...ROOT,
        "redisOps",
        projectId,
        resourceId,
        windowMs,
      ]);
      const { data } = await client.GET(
        "/projects/{projectId}/resources/{resourceId}/metrics/redisOps",
        {
          params: {
            path: { projectId, resourceId },
            query: buildRangeQuery(cached, windowMs),
          },
        },
      );
      return data!;
    },
  });
