import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import type { Formatted } from "./format";

// Detailed Metrics-tab charts. Larger than the overview sparklines:
// time X-axis, value Y-axis, gridlines, per-series legend, and a
// current/avg/max summary above the plot. Built on the same recharts
// primitives + shared formatters as the sparklines so units match.

const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

const CHART_HEIGHT = 176; // h-44

export interface ChartSeries {
  key: string;
  label: string;
  // value is null at gap buckets the metrics source had no sample for; the
  // chart breaks the line there (connectNulls={false}).
  points: { time: string; value: number | null }[];
}

// Pivoted recharts row: numeric timestamp `t` plus one column per series key.
interface ChartRow {
  t: number;
  [key: string]: number | null;
}

// fmtStamp is the full hover-tooltip time: date + hh:mm:ss. The axis ticks
// stay compact (fmtClock, hh:mm); the tooltip wants the precise sample time.
function fmtStamp(ms: number): string {
  return new Date(ms).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function fmtClock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// latestTime returns the newest sample time (ms) across series, or 0 if
// empty. Used as the chart's right edge instead of Date.now() — keeps
// render pure (no clock read) and pins the axis to real data.
function latestTime(series: ChartSeries[]): number {
  let max = 0;
  for (const s of series) {
    for (const p of s.points) {
      const t = new Date(p.time).getTime();
      if (t > max) max = t;
    }
  }
  return max;
}

// pivot collapses N series into recharts rows keyed by timestamp (ms),
// one column per series key. Clips to [now - windowMs, now].
function pivot(
  series: ChartSeries[],
  windowMs: number,
  now: number,
): { rows: ChartRow[]; min: number } {
  const min = now - windowMs;
  const byTime = new Map<number, ChartRow>();
  for (const s of series) {
    for (const p of s.points) {
      const t = new Date(p.time).getTime();
      if (t < min) continue;
      const row = byTime.get(t) ?? { t };
      row[s.key] = p.value;
      byTime.set(t, row);
    }
  }
  const rows = Array.from(byTime.values()).sort((a, b) => a.t - b.t);
  return { rows, min };
}

// summarize returns current (latest across series), avg, max over all
// plotted points.
function summarize(series: ChartSeries[]): {
  current: number;
  avg: number;
  max: number;
} {
  let sum = 0;
  let count = 0;
  let max = 0;
  let current = 0;
  let latestT = -Infinity;
  for (const s of series) {
    for (const p of s.points) {
      if (p.value == null) continue; // gap bucket — not a real sample
      sum += p.value;
      count++;
      if (p.value > max) max = p.value;
      const t = new Date(p.time).getTime();
      if (t > latestT) {
        latestT = t;
        current = p.value;
      } else if (t === latestT && p.value > current) {
        current = p.value;
      }
    }
  }
  return { current, avg: count > 0 ? sum / count : 0, max };
}

function ChartFrame({
  title,
  headline,
  summary,
  legend,
  children,
  // pending = the shown data is from the previous window while a new range
  // loads (react-query keepPreviousData). Surfaced as a faint pulse so the
  // chart reads as "refreshing" instead of frozen.
  pending,
}: {
  title: React.ReactNode;
  headline: React.ReactNode;
  summary?: React.ReactNode;
  legend?: React.ReactNode;
  children: React.ReactNode;
  pending?: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-xs font-medium">{title}</p>
        {legend}
      </div>
      <p className="text-lg font-semibold font-mono mt-1">{headline}</p>
      {summary && (
        <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
          {summary}
        </p>
      )}
      <div className="relative mt-3" style={{ height: CHART_HEIGHT }}>
        {children}
        {pending && (
          <div className="absolute inset-0 rounded-md bg-foreground/[0.04] animate-pulse pointer-events-none" />
        )}
      </div>
    </div>
  );
}

function Headline({ f }: { f: Formatted }) {
  return (
    <>
      {f.value}
      <span className="text-xs ml-0.5 text-muted-foreground">{f.unit}</span>
    </>
  );
}

function fmtPair(f: Formatted): string {
  return `${f.value}${f.unit}`;
}

// estimateAxisWidth sizes the Y axis to the longest tick label it will
// render (recharts has no reliable auto-width). ~6px/char at fontSize 10
// plus tick margin + breathing room, clamped to a sane range.

export function DetailChart({
  title,
  series,
  windowMs,
  format,
  headlineFormat,
  pending,
  namedSeries,
}: {
  title: string;
  series: ChartSeries[];
  windowMs: number;
  // format renders Y-axis ticks + summary in raw units.
  format: (v: number) => Formatted;
  // headlineFormat optionally overrides the big number (e.g. percent-of-limit).
  headlineFormat?: (v: number) => Formatted;
  // pending = a new time window is loading; show the prior data pulsing.
  pending?: boolean;
  // namedSeries = the series labels are human-meaningful (e.g. "In"/"Out")
  // and worth a legend. Per-pod charts label by opaque pod-id hash, which is
  // noise here — they omit this and rely on the on-hover tooltip instead.
  namedSeries?: boolean;
}) {
  const now = latestTime(series);
  const { rows, min } = pivot(series, windowMs, now);
  const stats = summarize(series);
  const headFmt = headlineFormat ?? format;
  const multi = series.length > 1;

  return (
    <ChartFrame
      title={title}
      pending={pending}
      headline={<Headline f={headFmt(stats.current)} />}
      summary={`avg ${fmtPair(format(stats.avg))} · max ${fmtPair(format(stats.max))}`}
      legend={
        namedSeries && multi ? (
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {series.map((s, i) => (
              <span
                key={s.key}
                className="flex items-center gap-1 text-[10px] text-muted-foreground"
              >
                <span
                  className="inline-block size-2 rounded-[2px]"
                  style={{ background: PALETTE[i % PALETTE.length] }}
                />
                {s.label}
              </span>
            ))}
          </div>
        ) : undefined
      }
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
        <AreaChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="detail-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.15} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            domain={[min, now]}
            scale="time"
            tickFormatter={fmtClock}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            minTickGap={48}
          />
          <YAxis
            width="auto"
            tickMargin={4}
            tickFormatter={(v: number) => fmtPair(format(v))}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="rounded-md bg-popover px-2 py-1.5 text-xs font-mono shadow-md ring-1 ring-foreground/10 space-y-0.5">
                  {payload.map((entry) => {
                    if (entry.value == null) return null;
                    const s = series.find((x) => x.key === entry.dataKey);
                    const f = format(entry.value as number);
                    return (
                      <div
                        key={String(entry.dataKey)}
                        className="flex items-center justify-between gap-3"
                      >
                        {multi && (
                          <span className="text-muted-foreground">
                            {s?.label ?? String(entry.dataKey)}
                          </span>
                        )}
                        <span>{fmtPair(f)}</span>
                      </div>
                    );
                  })}
                  <div className="text-[10px] text-muted-foreground pt-0.5">
                    {fmtStamp(label as number)}
                  </div>
                </div>
              );
            }}
            cursor={{
              stroke: "var(--muted-foreground)",
              strokeWidth: 1,
              strokeDasharray: "3 3",
            }}
          />
          {series.map((s, i) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={multi ? PALETTE[i % PALETTE.length] : "var(--primary)"}
              fill={multi ? "transparent" : "url(#detail-fill)"}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

const LATENCY_KEYS = [
  { key: "p99", label: "P99" },
  { key: "p95", label: "P95" },
  { key: "p50", label: "P50" },
] as const;

export function DetailLatencyChart({
  rows,
  windowMs,
  format,
  pending,
}: {
  // p50/p95/p99 are null at gap buckets; the chart breaks each line there.
  rows: {
    time: string;
    p50: number | null;
    p95: number | null;
    p99: number | null;
  }[];
  windowMs: number;
  format: (v: number) => Formatted;
  // pending = a new time window is loading; show the prior data pulsing.
  pending?: boolean;
}) {
  let now = 0;
  for (const r of rows) {
    const t = new Date(r.time).getTime();
    if (t > now) now = t;
  }
  const min = now - windowMs;
  const data = rows
    .map((r) => ({
      t: new Date(r.time).getTime(),
      p50: r.p50,
      p95: r.p95,
      p99: r.p99,
    }))
    .filter((r) => r.t >= min)
    .sort((a, b) => a.t - b.t);

  // Headline/summary track the most recent real sample, skipping trailing
  // gap buckets (null).
  const latest = [...data].reverse().find((r) => r.p95 != null);
  const headline = latest ? format(latest.p95 ?? 0) : format(0);

  return (
    <ChartFrame
      title="Latency"
      pending={pending}
      headline={<Headline f={headline} />}
      summary={
        latest
          ? `P50 ${fmtPair(format(latest.p50 ?? 0))} · P95 ${fmtPair(format(latest.p95 ?? 0))} · P99 ${fmtPair(format(latest.p99 ?? 0))}`
          : undefined
      }
      legend={
        <div className="flex items-center gap-2 justify-end">
          {LATENCY_KEYS.map((k, i) => (
            <span
              key={k.key}
              className="flex items-center gap-1 text-[10px] text-muted-foreground"
            >
              <span
                className="inline-block size-2 rounded-[2px]"
                style={{ background: PALETTE[i % PALETTE.length] }}
              />
              {k.label}
            </span>
          ))}
        </div>
      }
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            domain={[min, now]}
            scale="time"
            tickFormatter={fmtClock}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            minTickGap={48}
          />
          <YAxis
            width="auto"
            tickMargin={4}
            tickFormatter={(v: number) => fmtPair(format(v))}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="rounded-md bg-popover px-2 py-1.5 text-xs font-mono shadow-md ring-1 ring-foreground/10 space-y-0.5">
                  {LATENCY_KEYS.map((k) => {
                    const entry = payload.find((p) => p.dataKey === k.key);
                    if (!entry || entry.value == null) return null;
                    return (
                      <div
                        key={k.key}
                        className="flex items-center justify-between gap-3"
                      >
                        <span className="text-muted-foreground">{k.label}</span>
                        <span>{fmtPair(format(entry.value as number))}</span>
                      </div>
                    );
                  })}
                  <div className="text-[10px] text-muted-foreground pt-0.5">
                    {fmtStamp(label as number)}
                  </div>
                </div>
              );
            }}
            cursor={{
              stroke: "var(--muted-foreground)",
              strokeWidth: 1,
              strokeDasharray: "3 3",
            }}
          />
          {LATENCY_KEYS.map((k, i) => (
            <Line
              key={k.key}
              type="monotone"
              dataKey={k.key}
              stroke={PALETTE[i % PALETTE.length]}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function ChartMessage({
  title,
  message,
  tone = "muted",
}: {
  title: string;
  message: string;
  tone?: "muted" | "error";
}) {
  return (
    <div className="py-5">
      <p className="text-xs font-medium">{title}</p>
      <div
        className="flex items-center justify-center text-xs text-muted-foreground"
        style={{ height: CHART_HEIGHT }}
      >
        <span className={cn(tone === "error" && "text-destructive")}>
          {message}
        </span>
      </div>
    </div>
  );
}
