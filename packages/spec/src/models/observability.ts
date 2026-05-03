import { z } from "zod"

export const ServiceEvent = z.object({
  id: z.string(),
  type: z.enum(["Normal", "Warning"]),
  reason: z.string(),
  message: z.string(),
  timestamp: z.iso.datetime(),
  involvedKind: z.string(),
  involvedName: z.string(),
  count: z.number().int().min(1),
}).meta({ id: "ServiceEvent" })

export const LogLine = z.object({
  timestamp: z.iso.datetime(),
  level: z.enum(["info", "warn", "error", "debug"]),
  message: z.string(),
}).meta({ id: "LogLine" })

export const RangePoint = z.object({
  time: z.iso.datetime(),
  value: z.number(),
}).meta({ id: "RangePoint" })

export const LatencyPoint = z.object({
  time: z.iso.datetime(),
  p50: z.number(),
  p95: z.number(),
  p99: z.number(),
}).meta({ id: "LatencyPoint" })

export const MetricsOverview = z.object({
  reqRate: z.array(RangePoint),
  errRate: z.array(RangePoint),
  cpu: z.array(RangePoint),
  memory: z.array(RangePoint),
  latency: z.array(LatencyPoint),
}).meta({ id: "MetricsOverview" })

export type ServiceEvent = z.infer<typeof ServiceEvent>
export type LogLine = z.infer<typeof LogLine>
export type RangePoint = z.infer<typeof RangePoint>
export type LatencyPoint = z.infer<typeof LatencyPoint>
export type MetricsOverview = z.infer<typeof MetricsOverview>
