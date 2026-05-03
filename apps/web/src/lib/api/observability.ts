import { queryOptions } from "@tanstack/react-query"
import type {
  ServiceEvent,
  LogLine,
  MetricsOverview,
  RangePoint,
  LatencyPoint,
} from "@vyft/spec"
import { delay } from "../mock/latency"

const ROOT = ["observability"] as const

const EVENT_TEMPLATES = [
  { type: "Normal" as const, reason: "Pulling", message: "Pulling image" },
  { type: "Normal" as const, reason: "Pulled", message: "Successfully pulled image" },
  { type: "Normal" as const, reason: "Created", message: "Created container" },
  { type: "Normal" as const, reason: "Started", message: "Started container" },
  { type: "Normal" as const, reason: "Scheduled", message: "Successfully assigned to node" },
  { type: "Warning" as const, reason: "Unhealthy", message: "Liveness probe failed: HTTP 503" },
  { type: "Warning" as const, reason: "BackOff", message: "Back-off restarting failed container" },
]

const LOG_TEMPLATES = [
  { level: "info" as const, message: "server listening on :8080" },
  { level: "info" as const, message: "GET /health 200 1ms" },
  { level: "info" as const, message: "GET /api/items 200 12ms" },
  { level: "info" as const, message: "POST /api/items 201 24ms" },
  { level: "warn" as const, message: "slow query (200ms) on items table" },
  { level: "debug" as const, message: "cache hit for key=user:1234" },
  { level: "error" as const, message: "failed to connect to redis: ECONNREFUSED" },
]

function seededRandom(seed: string): () => number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  let state = Math.abs(h) || 1
  return () => {
    state = (state * 9301 + 49297) % 233280
    return state / 233280
  }
}

function buildSeries(seed: string, points = 30, base = 50, range = 30): RangePoint[] {
  const rand = seededRandom(seed)
  const ts = Date.now()
  return Array.from({ length: points }, (_, i) => ({
    time: new Date(ts - (points - 1 - i) * 60_000).toISOString(),
    value: base + Math.sin(i / 3) * range * 0.3 + rand() * range * 0.4,
  }))
}

function buildLatency(seed: string, points = 30): LatencyPoint[] {
  const rand = seededRandom(seed)
  const ts = Date.now()
  return Array.from({ length: points }, (_, i) => ({
    time: new Date(ts - (points - 1 - i) * 60_000).toISOString(),
    p50: 20 + rand() * 10,
    p95: 60 + rand() * 30,
    p99: 120 + rand() * 60,
  }))
}

// ─── Service fns ─────────────────────────────────────────────────────────

async function listEvents(_projectId: string, resourceId: string): Promise<ServiceEvent[]> {
  await delay()
  const rand = seededRandom(resourceId)
  const ts = Date.now()
  const count = Math.floor(rand() * 5) + 3
  return Array.from({ length: count }, (_, i) => {
    const template = EVENT_TEMPLATES[Math.floor(rand() * EVENT_TEMPLATES.length)]!
    return {
      id: `${resourceId}-event-${i}`,
      type: template.type,
      reason: template.reason,
      message: template.message,
      timestamp: new Date(ts - i * 30_000).toISOString(),
      involvedKind: "Pod",
      involvedName: `pod-${i}`,
      count: 1,
    }
  })
}

async function listLogs(_projectId: string, resourceId: string, limit: number): Promise<LogLine[]> {
  await delay()
  const rand = seededRandom(`${resourceId}-logs`)
  const ts = Date.now()
  const count = Math.min(limit, 30)
  return Array.from({ length: count }, (_, i) => {
    const template = LOG_TEMPLATES[Math.floor(rand() * LOG_TEMPLATES.length)]!
    return {
      timestamp: new Date(ts - i * 5_000).toISOString(),
      level: template.level,
      message: template.message,
    }
  })
}

async function getMetrics(_projectId: string, resourceId: string): Promise<MetricsOverview> {
  await delay()
  return {
    reqRate: buildSeries(`${resourceId}-req`, 30, 25, 20),
    errRate: buildSeries(`${resourceId}-err`, 30, 1, 3),
    cpu: buildSeries(`${resourceId}-cpu`, 30, 35, 25),
    memory: buildSeries(`${resourceId}-mem`, 30, 256, 80),
    latency: buildLatency(`${resourceId}-lat`, 30),
  }
}

// ─── Queries ─────────────────────────────────────────────────────────────

export const events = (projectId: string, resourceId: string) =>
  queryOptions({
    queryKey: [...ROOT, "events", projectId, resourceId],
    queryFn: () => listEvents(projectId, resourceId),
  })

export const logs = (projectId: string, resourceId: string, limit: number = 100) =>
  queryOptions({
    queryKey: [...ROOT, "logs", projectId, resourceId, limit],
    queryFn: () => listLogs(projectId, resourceId, limit),
  })

export const metrics = (projectId: string, resourceId: string) =>
  queryOptions({
    queryKey: [...ROOT, "metrics", projectId, resourceId],
    queryFn: () => getMetrics(projectId, resourceId),
  })
