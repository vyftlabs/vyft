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

// MetricKind is no longer a wire enum (URL path is the discriminator)
// but the frontend still needs a typed list for layout iteration.
export const MetricKind = z
  .enum([
    "cpu",
    "memory",
    "disk",
    "network",
    "requestRate",
    "errorRate",
    "latency",
  ])
  .meta({ id: "MetricKind" });

// MetricRange lives on for /logs/search only. Metrics use from/to.
export const MetricRange = z
  .enum(["15m", "1h", "6h", "24h"])
  .meta({ id: "MetricRange" });

// Point types — each endpoint family has one concrete point shape.
// All values in canonical units:
//   cpu        cores
//   memory     bytes
//   disk       bytes (value=used, limit=capacity), per-PVC series
//   network    bytes/second (rx + tx), per-pod series
//   requestRate requests/second
//   errorRate  fraction (0..1)
//   latency    seconds
//
// disk reuses ResourcePoint/ResourceMetrics: `value` is used bytes,
// `limit` is the PVC capacity, and the series `id` is the disk name.

export const ResourcePoint = z
  .object({
    timestamp: z.number().int(),
    value: z.number(),
    limit: z.number().optional(),
    request: z.number().optional(),
  })
  .meta({ id: "ResourcePoint" });

export const RatePoint = z
  .object({
    timestamp: z.number().int(),
    value: z.number(),
  })
  .meta({ id: "RatePoint" });

export const LatencyPoint = z
  .object({
    timestamp: z.number().int(),
    p50: z.number(),
    p95: z.number(),
    p99: z.number(),
  })
  .meta({ id: "LatencyPoint" });

// NetworkPoint carries both directions for one timestamp, bytes/second.
export const NetworkPoint = z
  .object({
    timestamp: z.number().int(),
    rx: z.number(),
    tx: z.number(),
  })
  .meta({ id: "NetworkPoint" });

// Series envelope. `id` is per-series identity (pod name for cpu/memory)
// and is omitted for aggregate series (rates, latency).

export const ResourceSeries = z
  .object({
    id: z.string().optional(),
    points: z.array(ResourcePoint),
  })
  .meta({ id: "ResourceSeries" });

export const RateSeries = z
  .object({
    id: z.string().optional(),
    points: z.array(RatePoint),
  })
  .meta({ id: "RateSeries" });

export const LatencySeries = z
  .object({
    id: z.string().optional(),
    points: z.array(LatencyPoint),
  })
  .meta({ id: "LatencySeries" });

// NetworkSeries is per-pod; `id` is the pod name.
export const NetworkSeries = z
  .object({
    id: z.string().optional(),
    points: z.array(NetworkPoint),
  })
  .meta({ id: "NetworkSeries" });

// Response envelopes per endpoint family.

export const ResourceMetrics = z
  .object({ series: z.array(ResourceSeries) })
  .meta({ id: "ResourceMetrics" });

export const RateMetrics = z
  .object({ series: z.array(RateSeries) })
  .meta({ id: "RateMetrics" });

export const LatencyMetrics = z
  .object({ series: z.array(LatencySeries) })
  .meta({ id: "LatencyMetrics" });

export const NetworkMetrics = z
  .object({ series: z.array(NetworkSeries) })
  .meta({ id: "NetworkMetrics" });

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
export type MetricKind = z.infer<typeof MetricKind>;
export type MetricRange = z.infer<typeof MetricRange>;
export type ResourcePoint = z.infer<typeof ResourcePoint>;
export type RatePoint = z.infer<typeof RatePoint>;
export type LatencyPoint = z.infer<typeof LatencyPoint>;
export type NetworkPoint = z.infer<typeof NetworkPoint>;
export type ResourceSeries = z.infer<typeof ResourceSeries>;
export type RateSeries = z.infer<typeof RateSeries>;
export type LatencySeries = z.infer<typeof LatencySeries>;
export type NetworkSeries = z.infer<typeof NetworkSeries>;
export type ResourceMetrics = z.infer<typeof ResourceMetrics>;
export type RateMetrics = z.infer<typeof RateMetrics>;
export type LatencyMetrics = z.infer<typeof LatencyMetrics>;
export type NetworkMetrics = z.infer<typeof NetworkMetrics>;
