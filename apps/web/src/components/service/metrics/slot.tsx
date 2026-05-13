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

const KIND_UNITS: Record<MetricKind, string> = {
  cpu: "m",
  memory: "B",
  reqRate: "/s",
  errRate: "%",
  latency: "ms",
};

const POLL_INTERVAL_MS = 15_000;

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
  return series.kind === "latency" ? series.points.length : series.points.length;
}

function renderLive(kind: MetricKind, series: MetricSeries) {
  if (series.kind === "latency") {
    return (
      <LatencySparkline
        data={series.points as unknown as Record<string, unknown>[]}
        keys={[
          { dataKey: "p99", label: "P99" },
          { dataKey: "p95", label: "P95" },
          { dataKey: "p50", label: "P50" },
        ]}
        unit="ms"
      />
    );
  }
  return (
    <Sparkline
      title={KIND_LABELS[kind]}
      data={series.points as unknown as Record<string, unknown>[]}
      dataKey="value"
      unit={KIND_UNITS[kind]}
    />
  );
}
