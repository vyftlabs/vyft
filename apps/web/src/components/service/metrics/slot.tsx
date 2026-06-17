import { useQuery } from "@tanstack/react-query";
import type {
  LatencyMetrics,
  LatencyPoint,
  MetricKind,
  RateMetrics,
  RatePoint,
  ResourceMetrics,
  ResourcePoint,
} from "@vyft/spec";
import {
  LatencySparkline,
  MultiSparkline,
  Sparkline,
} from "@/components/service/drawer/sparklines";
import * as api from "@/lib/api";
import { ApiError } from "@/lib/api/errors";
import { MetricSlotChrome } from "./chrome";
import {
  formatBytes,
  formatCores,
  formatFraction,
  formatPercentOfLimit,
  formatRate,
  formatSeconds,
  KIND_LABELS,
} from "./format";

// ── slot ──────────────────────────────────────────────────────────────

export function MetricSlot({
  projectId,
  resourceId,
  kind,
}: {
  projectId: string;
  resourceId: string;
  kind: MetricKind;
}) {
  switch (kind) {
    case "cpu":
      return <ResourceSlot projectId={projectId} resourceId={resourceId} kind="cpu" />;
    case "memory":
      return <ResourceSlot projectId={projectId} resourceId={resourceId} kind="memory" />;
    case "requestRate":
      return <RateSlot projectId={projectId} resourceId={resourceId} kind="requestRate" />;
    case "errorRate":
      return <RateSlot projectId={projectId} resourceId={resourceId} kind="errorRate" />;
    case "latency":
      return <LatencySlot projectId={projectId} resourceId={resourceId} />;
  }
}

// ── helpers ───────────────────────────────────────────────────────────

// is404 distinguishes "kind not detected" from real failures. Checks
// the code property directly rather than `instanceof ApiError` because
// class identity can drift across hot-reload / module boundaries.
function is404(err: unknown): boolean {
  if (err instanceof ApiError) return err.code === "NOT_FOUND";
  if (typeof err === "object" && err !== null && "code" in err) {
    return (err as { code: unknown }).code === "NOT_FOUND";
  }
  return false;
}

function LoadingChrome({ kind }: { kind: MetricKind }) {
  return (
    <MetricSlotChrome
      className="bg-muted/20 animate-pulse"
      title={KIND_LABELS[kind]}
      headline={<span className="opacity-0">—</span>}
      body={null}
    />
  );
}

function NotDetectedChrome({ kind }: { kind: MetricKind }) {
  return (
    <MetricSlotChrome
      title={KIND_LABELS[kind]}
      headline={<span className="text-muted-foreground/60">—</span>}
      body={
        <div className="w-full border-b border-muted-foreground/20" />
      }
    />
  );
}

function ErrorChrome({ kind, message }: { kind: MetricKind; message: string }) {
  return (
    <MetricSlotChrome
      className="bg-destructive/10"
      title={KIND_LABELS[kind]}
      headline={
        <span className="text-xs font-normal font-sans text-destructive line-clamp-1">
          {message}
        </span>
      }
      body={null}
    />
  );
}

// ── ResourceSlot: cpu + memory ────────────────────────────────────────

function ResourceSlot({
  projectId,
  resourceId,
  kind,
}: {
  projectId: string;
  resourceId: string;
  kind: "cpu" | "memory";
}) {
  const q = useQuery({
    ...(kind === "cpu"
      ? api.observability.cpuMetrics(projectId, resourceId)
      : api.observability.memoryMetrics(projectId, resourceId)),
  });
  if (q.isLoading) return <LoadingChrome kind={kind} />;
  if (q.error) {
    if (is404(q.error)) return <NotDetectedChrome kind={kind} />;
    return <ErrorChrome kind={kind} message="Query failed." />;
  }
  return <ResourceChart kind={kind} data={q.data!} />;
}

function ResourceChart({
  kind,
  data,
}: {
  kind: "cpu" | "memory";
  data: ResourceMetrics;
}) {
  const baseFormatter = kind === "cpu" ? formatCores : formatBytes;

  // Pick the latest limit seen across all series (they all share it).
  let limit = 0;
  for (const s of data.series) {
    for (const p of s.points) {
      if (p.limit && p.limit > limit) limit = p.limit;
    }
  }

  const formatter =
    limit > 0
      ? (v: number) => formatPercentOfLimit(v, limit, baseFormatter)
      : baseFormatter;

  // Convert ResourcePoint[] → sparkline rows ({time: ISO, value: number}).
  const seriesForChart = data.series.map((s) => ({
    key: s.id ?? "default",
    label: s.id ?? "—",
    points: s.points.map((p: ResourcePoint) => ({
      time: new Date(p.timestamp).toISOString(),
      value: p.value,
    })),
  }));

  if (seriesForChart.length === 0 || seriesForChart.every((s) => s.points.length === 0)) {
    return <NotDetectedChrome kind={kind} />;
  }

  // Single series → simple sparkline. Multiple → per-pod multi-line.
  if (seriesForChart.length === 1) {
    return (
      <Sparkline
        title={KIND_LABELS[kind]}
        data={seriesForChart[0]!.points as unknown as Record<string, unknown>[]}
        dataKey="value"
        unit=""
        formatHeadline={formatter}
      />
    );
  }

  const tooltipExtra = (time: string) => (
    <PodBreakdown
      byPod={seriesForChart.map((s) => ({ pod: s.label, points: s.points }))}
      time={time}
      format={baseFormatter}
    />
  );

  return (
    <MultiSparkline
      title={KIND_LABELS[kind]}
      series={seriesForChart}
      formatHeadline={formatter}
      tooltipExtra={tooltipExtra}
    />
  );
}

// PodBreakdown lists each pod's value at the hovered timestamp. Falls
// back to the nearest sample within 60s drift (cursor may land between
// scrape ticks). Pods with no nearby data are skipped.
function PodBreakdown({
  byPod,
  time,
  format,
}: {
  byPod: { pod: string; points: { time: string; value: number }[] }[];
  time: string;
  format: (v: number) => { value: string; unit: string };
}) {
  const target = new Date(time).getTime();
  const rows = byPod
    .map((p) => ({ pod: p.pod, point: nearestPoint(p.points, target) }))
    .filter((r) => r.point !== null);
  if (rows.length === 0) return null;
  return (
    <div className="space-y-0.5">
      {rows.map((r) => {
        const f = format(r.point!.value);
        return (
          <div
            key={r.pod}
            className="flex items-baseline justify-between gap-3 text-[10px]"
          >
            <span className="text-muted-foreground truncate">{r.pod}</span>
            <span>
              {f.value}
              {f.unit}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function nearestPoint(
  points: { time: string; value: number }[],
  targetMs: number,
): { time: string; value: number } | null {
  if (points.length === 0) return null;
  let best = points[0]!;
  let bestDiff = Math.abs(new Date(best.time).getTime() - targetMs);
  const maxDriftMs = 60 * 1000;
  for (const p of points) {
    const diff = Math.abs(new Date(p.time).getTime() - targetMs);
    if (diff < bestDiff) {
      best = p;
      bestDiff = diff;
    }
  }
  if (bestDiff > maxDriftMs) return null;
  return best;
}

// ── RateSlot: requestRate + errorRate ─────────────────────────────────

function RateSlot({
  projectId,
  resourceId,
  kind,
}: {
  projectId: string;
  resourceId: string;
  kind: "requestRate" | "errorRate";
}) {
  const q = useQuery({
    ...(kind === "requestRate"
      ? api.observability.requestRateMetrics(projectId, resourceId)
      : api.observability.errorRateMetrics(projectId, resourceId)),
  });
  if (q.isLoading) return <LoadingChrome kind={kind} />;
  if (q.error) {
    if (is404(q.error)) return <NotDetectedChrome kind={kind} />;
    return <ErrorChrome kind={kind} message="Query failed." />;
  }
  return <RateChart kind={kind} data={q.data!} />;
}

function RateChart({
  kind,
  data,
}: {
  kind: "requestRate" | "errorRate";
  data: RateMetrics;
}) {
  const series = data.series[0];
  if (!series || series.points.length === 0)
    return <NotDetectedChrome kind={kind} />;
  const rows = series.points.map((p: RatePoint) => ({
    time: new Date(p.timestamp).toISOString(),
    value: p.value,
  }));
  const formatter = kind === "requestRate" ? formatRate : formatFraction;
  return (
    <Sparkline
      title={KIND_LABELS[kind]}
      data={rows as unknown as Record<string, unknown>[]}
      dataKey="value"
      unit=""
      formatHeadline={formatter}
    />
  );
}

// ── LatencySlot ───────────────────────────────────────────────────────

function LatencySlot({
  projectId,
  resourceId,
}: {
  projectId: string;
  resourceId: string;
}) {
  const q = useQuery(api.observability.latencyMetrics(projectId, resourceId));
  if (q.isLoading) return <LoadingChrome kind="latency" />;
  if (q.error) {
    if (is404(q.error)) return <NotDetectedChrome kind="latency" />;
    return <ErrorChrome kind="latency" message="Query failed." />;
  }
  return <LatencyChart data={q.data!} />;
}

function LatencyChart({ data }: { data: LatencyMetrics }) {
  const series = data.series[0];
  if (!series || series.points.length === 0)
    return <NotDetectedChrome kind="latency" />;
  const rows = series.points.map((p: LatencyPoint) => ({
    time: new Date(p.timestamp).toISOString(),
    p50: p.p50,
    p95: p.p95,
    p99: p.p99,
  }));
  return (
    <LatencySparkline
      data={rows as unknown as Record<string, unknown>[]}
      keys={[
        { dataKey: "p99", label: "P99" },
        { dataKey: "p95", label: "P95" },
        { dataKey: "p50", label: "P50" },
      ]}
      unit="s"
      formatHeadline={formatSeconds}
    />
  );
}
