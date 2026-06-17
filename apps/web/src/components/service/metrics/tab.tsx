import { useQuery } from "@tanstack/react-query";
import type {
  LatencyMetrics,
  NetworkMetrics,
  RateMetrics,
  ResourceMetrics,
} from "@vyft/spec";
import { ScrollArea } from "@/components/ui/scroll-area";
import * as api from "@/lib/api";
import { ApiError } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import {
  type ChartSeries,
  ChartMessage,
  DetailChart,
  DetailLatencyChart,
} from "./chart";
import {
  formatBytes,
  formatBytesPerSec,
  formatCores,
  formatFraction,
  formatPercentOfLimit,
  formatRate,
  formatSeconds,
  KIND_LABELS,
} from "./format";

export const RANGES = [
  { label: "15m", ms: 15 * 60 * 1000 },
  { label: "1h", ms: 60 * 60 * 1000 },
  { label: "6h", ms: 6 * 60 * 60 * 1000 },
  // 24h is the Prometheus retention ceiling — nothing older is stored.
  { label: "24h", ms: 24 * 60 * 60 * 1000 },
] as const;

export const DEFAULT_METRICS_WINDOW_MS = RANGES[1].ms;

// Controlled: the range selector lives in the drawer tab bar (rendered via
// the tab's headerRight slot), so windowMs is owned one level up.
export function MetricsTab({
  projectId,
  resourceId,
  windowMs,
}: {
  projectId: string;
  resourceId: string;
  windowMs: number;
}) {
  return (
    <ScrollArea className="h-full -mr-6 pr-6">
      <div className="divide-y pb-4 [&>*:first-child>*]:!pt-0">

        <PairRow>
          <ResourcePanel
            kind="cpu"
            projectId={projectId}
            resourceId={resourceId}
            windowMs={windowMs}
          />
          <ResourcePanel
            kind="memory"
            projectId={projectId}
            resourceId={resourceId}
            windowMs={windowMs}
          />
        </PairRow>
        <NetworkPanel
          projectId={projectId}
          resourceId={resourceId}
          windowMs={windowMs}
        />
        <ResourcePanel
          kind="disk"
          projectId={projectId}
          resourceId={resourceId}
          windowMs={windowMs}
        />
        <PairRow>
          <RatePanel
            kind="requestRate"
            projectId={projectId}
            resourceId={resourceId}
            windowMs={windowMs}
          />
          <RatePanel
            kind="errorRate"
            projectId={projectId}
            resourceId={resourceId}
            windowMs={windowMs}
          />
        </PairRow>
        <LatencyPanel
          projectId={projectId}
          resourceId={resourceId}
          windowMs={windowMs}
        />
      </div>
    </ScrollArea>
  );
}

// PairRow places two charts side by side, split by a vertical rule (on
// desktop) or stacked with a horizontal rule (on mobile). Rows themselves
// are separated by the divide-y on their container.
function PairRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 [&>*:last-child]:border-t lg:[&>*:last-child]:border-t-0 [&>*:first-child]:lg:pr-8 [&>*:last-child]:lg:border-l [&>*:last-child]:lg:pl-8">
      {children}
    </div>
  );
}

export function RangeSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (ms: number) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-md border p-0.5 gap-0.5">
      {RANGES.map((r) => (
        <button
          key={r.label}
          type="button"
          onClick={() => onChange(r.ms)}
          data-testid={`service.metrics.range.${r.label}`}
          className={cn(
            "px-2.5 py-1 text-xs rounded-[5px] transition-colors",
            value === r.ms
              ? "bg-muted text-foreground font-medium"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

// is404 distinguishes "kind not supported by this source" (e.g. disk on
// metrics-server, or no metrics source at all) from real query failures.
function is404(err: unknown): boolean {
  if (err instanceof ApiError) return err.code === "NOT_FOUND";
  if (typeof err === "object" && err !== null && "code" in err) {
    return (err as { code: unknown }).code === "NOT_FOUND";
  }
  return false;
}

// maxLimit scans every point for the largest limit seen (workload-level
// cap for cpu/memory; per-PVC capacity for disk).
function maxLimit(series: ResourceMetrics["series"]): number {
  let limit = 0;
  for (const s of series) {
    for (const p of s.points) {
      if (p.limit && p.limit > limit) limit = p.limit;
    }
  }
  return limit;
}

function ResourcePanel({
  kind,
  projectId,
  resourceId,
  windowMs,
}: {
  kind: "cpu" | "memory" | "disk";
  projectId: string;
  resourceId: string;
  windowMs: number;
}) {
  const opts =
    kind === "cpu"
      ? api.observability.cpuMetrics(projectId, resourceId, windowMs)
      : kind === "memory"
        ? api.observability.memoryMetrics(projectId, resourceId, windowMs)
        : api.observability.diskMetrics(projectId, resourceId, windowMs);
  const q = useQuery(opts);
  const title = KIND_LABELS[kind];

  if (q.isLoading) return <ChartMessage title={title} message="Loading…" />;
  if (q.error) {
    if (is404(q.error))
      return <ChartMessage title={title} message="Not available." />;
    return (
      <ChartMessage title={title} message="Query failed." tone="error" />
    );
  }

  const data = q.data as ResourceMetrics;
  const series: ChartSeries[] = data.series
    .map((s) => ({
      key: s.id ?? "default",
      label: s.id ?? title,
      points: s.points.map((p) => ({
        time: new Date(p.timestamp).toISOString(),
        value: p.value,
      })),
    }))
    .filter((s) => s.points.length > 0);

  if (series.length === 0)
    return <ChartMessage title={title} message="No data yet." />;

  const base = kind === "cpu" ? formatCores : formatBytes;
  const limit = maxLimit(data.series);
  const headlineFormat =
    limit > 0 ? (v: number) => formatPercentOfLimit(v, limit, base) : undefined;

  return (
    <DetailChart
      title={title}
      series={series}
      windowMs={windowMs}
      format={base}
      headlineFormat={headlineFormat}
      pending={q.isPlaceholderData}
    />
  );
}

// NetworkPanel aggregates per-pod rx/tx into two series (total in / out).
function NetworkPanel({
  projectId,
  resourceId,
  windowMs,
}: {
  projectId: string;
  resourceId: string;
  windowMs: number;
}) {
  const q = useQuery(
    api.observability.networkMetrics(projectId, resourceId, windowMs),
  );
  const title = KIND_LABELS.network;

  if (q.isLoading) return <ChartMessage title={title} message="Loading…" />;
  if (q.error) {
    if (is404(q.error))
      return <ChartMessage title={title} message="Not available." />;
    return <ChartMessage title={title} message="Query failed." tone="error" />;
  }

  const data = q.data as NetworkMetrics;
  // Aggregate per-pod into total in/out. A timestamp is a gap (null) only
  // when no pod reported a value there — otherwise sum the pods that did.
  type Acc = { sum: number; any: boolean };
  const rx = new Map<number, Acc>();
  const tx = new Map<number, Acc>();
  const add = (m: Map<number, Acc>, t: number, v: number | null) => {
    const e = m.get(t) ?? { sum: 0, any: false };
    if (v != null) {
      e.sum += v;
      e.any = true;
    }
    m.set(t, e);
  };
  for (const s of data.series) {
    for (const p of s.points) {
      add(rx, p.timestamp, p.rx);
      add(tx, p.timestamp, p.tx);
    }
  }
  const toPoints = (m: Map<number, Acc>) =>
    [...m.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([t, e]) => ({
        time: new Date(t).toISOString(),
        value: e.any ? e.sum : null,
      }));
  const series: ChartSeries[] = [
    { key: "rx", label: "In", points: toPoints(rx) },
    { key: "tx", label: "Out", points: toPoints(tx) },
  ].filter((s) => s.points.length > 0);

  if (series.length === 0)
    return <ChartMessage title={title} message="No data yet." />;

  return (
    <DetailChart
      title={title}
      series={series}
      windowMs={windowMs}
      format={formatBytesPerSec}
      pending={q.isPlaceholderData}
    />
  );
}

function RatePanel({
  kind,
  projectId,
  resourceId,
  windowMs,
}: {
  kind: "requestRate" | "errorRate";
  projectId: string;
  resourceId: string;
  windowMs: number;
}) {
  const q = useQuery(
    kind === "requestRate"
      ? api.observability.requestRateMetrics(projectId, resourceId, windowMs)
      : api.observability.errorRateMetrics(projectId, resourceId, windowMs),
  );
  const title = KIND_LABELS[kind];

  if (q.isLoading) return <ChartMessage title={title} message="Loading…" />;
  if (q.error) {
    if (is404(q.error))
      return <ChartMessage title={title} message="Not available." />;
    return <ChartMessage title={title} message="Query failed." tone="error" />;
  }

  const data = q.data as RateMetrics;
  const points = (data.series[0]?.points ?? []).map((p) => ({
    time: new Date(p.timestamp).toISOString(),
    value: p.value,
  }));
  if (points.length === 0)
    return <ChartMessage title={title} message="No data yet." />;

  return (
    <DetailChart
      title={title}
      series={[{ key: "value", label: title, points }]}
      windowMs={windowMs}
      format={kind === "requestRate" ? formatRate : formatFraction}
      pending={q.isPlaceholderData}
    />
  );
}

function LatencyPanel({
  projectId,
  resourceId,
  windowMs,
}: {
  projectId: string;
  resourceId: string;
  windowMs: number;
}) {
  const q = useQuery(
    api.observability.latencyMetrics(projectId, resourceId, windowMs),
  );
  const title = KIND_LABELS.latency;

  if (q.isLoading) return <ChartMessage title={title} message="Loading…" />;
  if (q.error) {
    if (is404(q.error))
      return <ChartMessage title={title} message="Not available." />;
    return <ChartMessage title={title} message="Query failed." tone="error" />;
  }

  const data = q.data as LatencyMetrics;
  const rows = (data.series[0]?.points ?? []).map((p) => ({
    time: new Date(p.timestamp).toISOString(),
    p50: p.p50,
    p95: p.p95,
    p99: p.p99,
  }));
  if (rows.length === 0)
    return <ChartMessage title={title} message="No data yet." />;

  return (
    <DetailLatencyChart
      rows={rows}
      windowMs={windowMs}
      format={formatSeconds}
      pending={q.isPlaceholderData}
    />
  );
}
