import type { MetricKind } from "@vyft/spec";

// Shared metric formatters + labels. Used by both the compact overview
// slots (slot.tsx) and the detailed Metrics tab charts (chart.tsx) so the
// two surfaces render identical units.

export const KIND_LABELS: Record<MetricKind, string> = {
  cpu: "CPU",
  memory: "Memory",
  disk: "Disk",
  network: "Network",
  requestRate: "Requests",
  errorRate: "Error rate",
  latency: "Latency",
  connections: "Connections",
  transactions: "Transactions",
  cacheHit: "Cache hit",
  dbSize: "Storage",
  replicationLag: "Replication lag",
  redisMemory: "Memory",
  redisClients: "Clients",
  redisOps: "Ops/sec",
};

// formatCount renders a plain count (e.g. connections) — integer-ish, no unit.
export function formatCount(v: number): Formatted {
  return { value: fmtTrim(v), unit: "" };
}

// formatTps renders transactions/second.
export function formatTps(v: number): Formatted {
  return { value: fmtTrim(v), unit: " tx/s" };
}

export interface Formatted {
  value: string;
  unit: string;
}

export function fmtTrim(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 100) return Math.round(v).toString();
  if (abs >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

export function formatBytes(b: number): Formatted {
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
  // Raw bytes: round to int at >=10 B (and exact 0), but keep decimals for
  // sub-10 B values so small throughput doesn't all collapse to "0 B/s".
  if (b === 0 || abs >= 10) return { value: Math.round(b).toString(), unit: "B" };
  return { value: fmtTrim(b), unit: "B" };
}

// formatBytesPerSec scales bytes/second through the same binary ladder,
// suffixed with "/s". Used for network throughput.
export function formatBytesPerSec(b: number): Formatted {
  const f = formatBytes(b);
  return { value: f.value, unit: `${f.unit}/s` };
}

// formatCores auto-scales cores → µ/m/cores. Backend emits canonical
// cores; idle workloads land in µ territory.
export function formatCores(c: number): Formatted {
  if (!Number.isFinite(c)) return { value: "—", unit: "m" };
  const abs = Math.abs(c);
  if (abs >= 1) return { value: fmtTrim(c), unit: "cores" };
  if (abs >= 0.001) return { value: fmtTrim(c * 1000), unit: "m" };
  return { value: fmtTrim(c * 1_000_000), unit: "µ" };
}

export function formatSeconds(s: number): Formatted {
  if (!Number.isFinite(s)) return { value: "—", unit: "ms" };
  const abs = Math.abs(s);
  if (abs >= 1) return { value: fmtTrim(s), unit: "s" };
  if (abs >= 0.001) return { value: fmtTrim(s * 1000), unit: "ms" };
  return { value: fmtTrim(s * 1_000_000), unit: "µs" };
}

export function formatRate(v: number): Formatted {
  return { value: fmtTrim(v), unit: "/s" };
}

// formatFraction renders an errorRate fraction (0..1) as a percent.
export function formatFraction(v: number): Formatted {
  return { value: fmtTrim(v * 100), unit: "%" };
}

// formatPercentOfLimit: percent big, current + cap small
// ("47% 473m / 1cores"). The limit it's a percent of is surfaced inline.
export function formatPercentOfLimit(
  v: number,
  limit: number,
  baseFormatter: (v: number) => Formatted,
): Formatted {
  const pct = (v / limit) * 100;
  const raw = baseFormatter(v);
  const cap = baseFormatter(limit);
  return {
    value: `${fmtTrim(pct)}%`,
    unit: ` ${raw.value}${raw.unit}\u2009/\u2009${cap.value}${cap.unit}`,
  };
}
