import { z } from "zod";
import { SourceKind } from "./source.ts";

export const ServiceEvent = z
  .object({
    id: z.string(),
    type: z.enum(["Normal", "Warning"]),
    reason: z.string(),
    message: z.string(),
    timestamp: z.iso.datetime(),
    involvedKind: z.string(),
    involvedName: z.string(),
    count: z.number().int().min(1),
  })
  .meta({ id: "ServiceEvent" });

export const LogLevel = z
  .enum(["error", "warn", "info", "debug", "unknown"])
  .meta({ id: "LogLevel" });

export const LogLine = z
  .object({
    timestamp: z.iso.datetime(),
    level: LogLevel,
    message: z.string(),
    pod: z.string().optional(),
    container: z.string().optional(),
  })
  .meta({ id: "LogLine" });

export const LogCapability = z
  .enum(["tail", "search", "level"])
  .meta({ id: "LogCapability" });

export const LogsCapabilities = z
  .object({
    sourceKind: SourceKind.nullable(),
    detected: z.array(LogCapability),
  })
  .meta({ id: "LogsCapabilities" });

export const RangePoint = z
  .object({
    time: z.iso.datetime(),
    value: z.number(),
  })
  .meta({ id: "RangePoint" });

export const LatencyPoint = z
  .object({
    time: z.iso.datetime(),
    p50: z.number(),
    p95: z.number(),
    p99: z.number(),
  })
  .meta({ id: "LatencyPoint" });

export const MetricKind = z
  .enum(["cpu", "memory", "reqRate", "errRate", "latency"])
  .meta({ id: "MetricKind" });

export const MetricRange = z
  .enum(["15m", "1h", "6h", "24h"])
  .meta({ id: "MetricRange" });

export const MetricsCapabilities = z
  .object({
    sourceKind: SourceKind.nullable(),
    detected: z.array(MetricKind),
  })
  .meta({ id: "MetricsCapabilities" });

const PodSeries = z.object({
  pod: z.string(),
  points: z.array(RangePoint),
});

export const MetricSeries = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("cpu"),
      range: MetricRange,
      points: z.array(RangePoint),
      // Pod CPU limit (millicores), aggregated across containers. Omitted
      // when the workload has no limit set; UI falls back to raw display.
      limit: z.number().optional(),
      // Per-pod breakdown used by the tooltip to surface noisy-neighbor
      // and historical (terminated) pods. Omitted by sources that can't
      // produce it (metrics-server). Sum across byPod equals `points`.
      byPod: z.array(PodSeries).optional(),
    }),
    z.object({
      kind: z.literal("memory"),
      range: MetricRange,
      points: z.array(RangePoint),
      limit: z.number().optional(),
      byPod: z.array(PodSeries).optional(),
    }),
    z.object({
      kind: z.literal("reqRate"),
      range: MetricRange,
      points: z.array(RangePoint),
    }),
    z.object({
      kind: z.literal("errRate"),
      range: MetricRange,
      points: z.array(RangePoint),
    }),
    z.object({
      kind: z.literal("latency"),
      range: MetricRange,
      points: z.array(LatencyPoint),
    }),
  ])
  .meta({ id: "MetricSeries" });

export const MetricsCeiling: Partial<
  Record<z.infer<typeof SourceKind>, z.infer<typeof MetricKind>[]>
> = {
  prometheus: ["cpu", "memory", "reqRate", "errRate", "latency"],
  metricsServer: ["cpu", "memory"],
};

export const LogsCeiling: Partial<
  Record<z.infer<typeof SourceKind>, z.infer<typeof LogCapability>[]>
> = {
  loki: ["tail", "search", "level"],
  kubeLogs: ["tail", "level"],
};

export type ServiceEvent = z.infer<typeof ServiceEvent>;
export type LogLevel = z.infer<typeof LogLevel>;
export type LogLine = z.infer<typeof LogLine>;
export type LogCapability = z.infer<typeof LogCapability>;
export type LogsCapabilities = z.infer<typeof LogsCapabilities>;
export type RangePoint = z.infer<typeof RangePoint>;
export type LatencyPoint = z.infer<typeof LatencyPoint>;
export type MetricKind = z.infer<typeof MetricKind>;
export type MetricRange = z.infer<typeof MetricRange>;
export type MetricsCapabilities = z.infer<typeof MetricsCapabilities>;
export type MetricSeries = z.infer<typeof MetricSeries>;
