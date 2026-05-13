import { useQuery } from "@tanstack/react-query";
import {
  type MetricKind,
  type MetricRange,
  type MetricSeries,
  type MetricsCapabilities,
  MetricsCeiling,
} from "@vyft/spec";
import { LatencySparkline, Sparkline } from "@/components/service/drawer/sparklines";
import * as api from "@/lib/api";
import { MetricSlotChrome } from "./chrome";
import { DisabledPanel } from "./disabled-panel";
import { EmptyDataPanel } from "./empty-data-panel";

const KIND_LABELS: Record<MetricKind, string> = {
  cpu: "CPU",
  memory: "Memory",
  reqRate: "Requests",
  errRate: "Error rate",
  latency: "Latency",
};

import { POLL_INTERVAL_MS } from "@/lib/api/observability";

// formatBytes auto-scales bytes → KiB / MiB / GiB / TiB. Spec says
// memory uses base-2 units.
function formatBytes(b: number): { value: string; unit: string } {
  if (!Number.isFinite(b)) return { value: "—", unit: "B" };
  const abs = Math.abs(b);
  const units: [number, string][] = [
    [1024 ** 4, "TiB"],
    [1024 ** 3, "GiB"],
    [1024 ** 2, "MiB"],
    [1024, "KiB"],
  ];
  for (const [div, unit] of units) {
    if (abs >= div) return { value: fmtTrim(b / div), unit };
  }
  return { value: Math.round(b).toString(), unit: "B" };
}

// formatMillicores stays in millicores below 1000m; auto-scales to cores
// at or above 1000m.
function formatMillicores(m: number): { value: string; unit: string } {
  if (!Number.isFinite(m)) return { value: "—", unit: "m" };
  if (Math.abs(m) >= 1000) return { value: fmtTrim(m / 1000), unit: "cores" };
  return { value: Math.round(m).toString(), unit: "m" };
}

// formatSeconds auto-scales between µs / ms / s.
function formatSeconds(s: number): { value: string; unit: string } {
  if (!Number.isFinite(s)) return { value: "—", unit: "ms" };
  const abs = Math.abs(s);
  if (abs >= 1) return { value: fmtTrim(s), unit: "s" };
  if (abs >= 0.001) return { value: fmtTrim(s * 1000), unit: "ms" };
  return { value: fmtTrim(s * 1_000_000), unit: "µs" };
}

function formatRate(v: number): { value: string; unit: string } {
  return { value: fmtTrim(v), unit: "/s" };
}

function formatPercent(v: number): { value: string; unit: string } {
  return { value: fmtTrim(v), unit: "%" };
}

function fmtTrim(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 100) return Math.round(v).toString();
  if (abs >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

const KIND_FORMATTERS: Record<
  Exclude<MetricKind, "latency">,
  (v: number) => { value: string; unit: string }
> = {
  cpu: formatMillicores,
  memory: formatBytes,
  reqRate: formatRate,
  errRate: formatPercent,
};

export function MetricSlot({
  projectId,
  resourceId,
  kind,
  range = "15m",
  capabilities,
  capabilitiesError,
}: {
  projectId: string;
  resourceId: string;
  kind: MetricKind;
  range?: MetricRange;
  capabilities?: MetricsCapabilities;
  capabilitiesError?: boolean;
}) {
  const sk = capabilities?.sourceKind ?? null;
  const ceiling = sk ? (MetricsCeiling[sk] ?? []) : [];
  const ceilingHas = !!sk && ceiling.includes(kind);
  const detected = !!capabilities?.detected.includes(kind);
  const enabled = !!sk && ceilingHas && detected;

  const kindQuery = useQuery({
    ...api.observability.metricsByKind(projectId, resourceId, kind, range),
    enabled,
    refetchInterval: POLL_INTERVAL_MS,
  });

  if (capabilitiesError) {
    return <DisabledPanel cause="unreachable" kind={kind} />;
  }
  if (!capabilities?.sourceKind) {
    return <DisabledPanel cause="none" kind={kind} />;
  }
  if (!ceilingHas) {
    return (
      <DisabledPanel
        cause="ceiling"
        kind={kind}
        sourceKind={capabilities.sourceKind}
      />
    );
  }
  if (!detected) {
    return <EmptyDataPanel cause="service-not-instrumented" kind={kind} />;
  }
  if (kindQuery.isLoading) {
    return (
      <MetricSlotChrome
        className="bg-muted/20 animate-pulse"
        title={KIND_LABELS[kind]}
        headline={<span className="opacity-0">—</span>}
        body={null}
      />
    );
  }
  if (kindQuery.error) {
    return (
      <MetricSlotChrome
        className="bg-destructive/10"
        title={KIND_LABELS[kind]}
        headline={
          <span className="text-xs font-normal font-sans text-destructive line-clamp-1">
            Query failed.
          </span>
        }
        body={null}
      />
    );
  }
  const series = kindQuery.data;
  if (!series || pointsLen(series) === 0) {
    return <EmptyDataPanel cause="no-data-in-range" kind={kind} />;
  }
  return renderLive(kind, series);
}

function pointsLen(series: MetricSeries): number {
  return series.points.length;
}

function renderLive(kind: MetricKind, series: MetricSeries) {
  if (series.kind === "latency") {
    // Backend sends seconds; auto-scale headline based on p95.
    return (
      <LatencySparkline
        data={series.points as unknown as Record<string, unknown>[]}
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
  const k = kind as Exclude<MetricKind, "latency">;
  const limit =
    series.kind === "cpu" || series.kind === "memory" ? series.limit : undefined;
  const baseFormatter = KIND_FORMATTERS[k];
  const formatter =
    limit && limit > 0
      ? (v: number) => formatPercentOfLimit(v, limit, baseFormatter)
      : baseFormatter;
  return (
    <Sparkline
      title={KIND_LABELS[kind]}
      data={series.points as unknown as Record<string, unknown>[]}
      dataKey="value"
      unit=""
      formatHeadline={formatter}
    />
  );
}

// formatPercentOfLimit returns "<percent>%" as the primary value and the
// raw measurement (via baseFormatter) as the trailing unit, e.g.
// "47%  ·  473m". The Sparkline renders `value` big and `unit` small so
// percent is the headline.
function formatPercentOfLimit(
  v: number,
  limit: number,
  baseFormatter: (v: number) => { value: string; unit: string },
): { value: string; unit: string } {
  const pct = (v / limit) * 100;
  const raw = baseFormatter(v);
  return {
    value: `${fmtTrim(pct)}%`,
    unit: ` ${raw.value}${raw.unit}`,
  };
}
