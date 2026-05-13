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

export const LogLine = z
  .object({
    timestamp: z.iso.datetime(),
    level: z.string(),
    message: z.string(),
  })
  .meta({ id: "LogLine" });

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

export const MetricsOverview = z
  .object({
    reqRate: z.array(RangePoint),
    errRate: z.array(RangePoint),
    cpu: z.array(RangePoint),
    memory: z.array(RangePoint),
    latency: z.array(LatencyPoint),
  })
  .meta({
    id: "MetricsOverview",
    description: "`cpu` values are millicores. `memory` values are bytes.",
  });

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

export const MetricSeries = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("cpu"),
      range: MetricRange,
      points: z.array(RangePoint),
      // Pod CPU limit (millicores), aggregated across containers. Omitted
      // when the workload has no limit set; UI falls back to raw display.
      limit: z.number().optional(),
    }),
    z.object({
      kind: z.literal("memory"),
      range: MetricRange,
      points: z.array(RangePoint),
      // Pod memory limit (bytes), aggregated across containers. Omitted
      // when the workload has no limit set; UI falls back to raw display.
      limit: z.number().optional(),
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

export const MetricsCeiling: Record<
  z.infer<typeof SourceKind>,
  z.infer<typeof MetricKind>[]
> = {
  prometheus: ["cpu", "memory", "reqRate", "errRate", "latency"],
  metricsServer: ["cpu", "memory"],
};

export type ServiceEvent = z.infer<typeof ServiceEvent>;
export type LogLine = z.infer<typeof LogLine>;
export type RangePoint = z.infer<typeof RangePoint>;
export type LatencyPoint = z.infer<typeof LatencyPoint>;
export type MetricsOverview = z.infer<typeof MetricsOverview>;
export type MetricKind = z.infer<typeof MetricKind>;
export type MetricRange = z.infer<typeof MetricRange>;
export type MetricsCapabilities = z.infer<typeof MetricsCapabilities>;
export type MetricSeries = z.infer<typeof MetricSeries>;
