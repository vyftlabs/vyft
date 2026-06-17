import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import type { LatencyChartData, SparklineData, Threshold } from "./shell";

type Severity = "critical" | "warning" | null;

function severity(value: number, threshold?: Threshold): Severity {
  if (!threshold) return null;
  if (value >= threshold.critical) return "critical";
  if (value >= threshold.warning) return "warning";
  return null;
}

const severityTextClass: Record<string, string> = {
  critical: "text-severity-critical-text",
  warning: "text-severity-warning-text",
};

function fmt(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 100) return Math.round(v).toString();
  if (abs >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? 0;
}

export function Sparkline({
  title,
  data,
  dataKey,
  unit,
  threshold,
  formatHeadline,
  tooltipExtra,
}: SparklineData & {
  formatHeadline?: (v: number) => { value: string; unit: string };
  // Optional per-row content rendered under the value in the tooltip.
  // Receives the hovered point's ISO timestamp. Used for the per-pod
  // breakdown on CPU + Memory.
  tooltipExtra?: (time: string) => React.ReactNode;
}) {
  const values = data.map((d) => (d[dataKey] as number) ?? 0);
  const current = values.length > 0 ? (values[values.length - 1] ?? 0) : 0;
  const level = severity(current, threshold);
  const headline = formatHeadline
    ? formatHeadline(current)
    : { value: fmt(current), unit };

  const warningKey = `${dataKey}_w`;
  const criticalKey = `${dataKey}_c`;
  const overlayData = threshold
    ? data.map((d) => {
        const v = (d[dataKey] as number) ?? 0;
        return {
          ...d,
          [warningKey]: v >= threshold.warning ? v : null,
          [criticalKey]: v >= threshold.critical ? v : null,
        };
      })
    : data;

  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{title}</p>
      <p
        className={cn(
          "text-lg font-semibold font-mono",
          level && severityTextClass[level],
        )}
      >
        {headline.value}
        <span
          className={cn(
            "text-xs ml-0.5",
            level ? severityTextClass[level] : "text-muted-foreground",
          )}
        >
          {headline.unit}
        </span>
      </p>
      <div className="h-10 mt-1" style={{ minWidth: 0, minHeight: 0 }}>
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={1}
          minHeight={1}
        >
          <AreaChart
            data={overlayData}
            margin={{ top: 2, right: 0, bottom: 0, left: 0 }}
          >
            <defs>
              <linearGradient
                id={`spark-fill-${dataKey}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor="var(--primary)"
                  stopOpacity={0.15}
                />
                <stop
                  offset="100%"
                  stopColor="var(--primary)"
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const v = payload[0]?.value as number;
                const s = severity(v, threshold);
                const formatted = formatHeadline
                  ? formatHeadline(v)
                  : { value: fmt(v), unit };
                const ts = payload[0]?.payload?.time as string | undefined;
                return (
                  <div
                    className={cn(
                      "rounded-md bg-popover px-2 py-1 text-xs font-mono shadow-md ring-1 ring-foreground/10 space-y-0.5",
                      s && severityTextClass[s],
                    )}
                  >
                    <div>
                      {formatted.value}
                      {formatted.unit}
                    </div>
                    {ts && tooltipExtra && (
                      <div className="text-foreground">
                        {tooltipExtra(ts)}
                      </div>
                    )}
                    {ts && (
                      <div className="text-[10px] text-muted-foreground">
                        {fmtTime(ts)}
                      </div>
                    )}
                  </div>
                );
              }}
              cursor={{
                stroke: "var(--muted-foreground)",
                strokeWidth: 1,
                strokeDasharray: "3 3",
              }}
            />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke="var(--primary)"
              fill={`url(#spark-fill-${dataKey})`}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
            {threshold && (
              <Area
                type="monotone"
                dataKey={warningKey}
                stroke="var(--color-severity-warning)"
                fill="none"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
                connectNulls={false}
              />
            )}
            {threshold && (
              <Area
                type="monotone"
                dataKey={criticalKey}
                stroke="var(--color-severity-critical)"
                fill="none"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
                connectNulls={false}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// MultiSparkline renders one line per series (e.g. per pod) inside the
// same chart slot used by Sparkline. No aggregate line — the headline
// value is the max across series at the most recent timestamp, which
// matches the "watch the worst-performing pod" framing.
export interface MultiSeries {
  key: string;
  label: string;
  // value is null at gap buckets; the per-pod line breaks there.
  points: { time: string; value: number | null }[];
}

const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export function MultiSparkline({
  title,
  series,
  formatHeadline,
  tooltipExtra,
}: {
  title: string;
  series: MultiSeries[];
  formatHeadline?: (v: number) => { value: string; unit: string };
  tooltipExtra?: (time: string) => React.ReactNode;
}) {
  // Pivot to recharts shape: [{ time, <k1>: v, <k2>: v, ... }].
  const byTime = new Map<string, Record<string, number | string | null>>();
  for (const s of series) {
    for (const p of s.points) {
      const row = byTime.get(p.time) ?? { time: p.time };
      row[s.key] = p.value;
      byTime.set(p.time, row);
    }
  }
  const data = Array.from(byTime.values()).sort((a, b) =>
    (a.time as string).localeCompare(b.time as string),
  );

  // Headline = max across pods at the latest timestamp w/ any data.
  let headlineVal = 0;
  for (let i = data.length - 1; i >= 0; i--) {
    const row = data[i]!;
    const vals = series
      .map((s) => row[s.key])
      .filter((v): v is number => typeof v === "number");
    if (vals.length > 0) {
      headlineVal = Math.max(...vals);
      break;
    }
  }
  const headline = formatHeadline
    ? formatHeadline(headlineVal)
    : { value: fmt(headlineVal), unit: "" };

  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{title}</p>
      <p className="text-lg font-semibold font-mono leading-7">
        {headline.value}
        <span className="text-xs ml-0.5 text-muted-foreground">
          {headline.unit}
        </span>
      </p>
      <div className="h-10 mt-1" style={{ minWidth: 0, minHeight: 0 }}>
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={1}
          minHeight={1}
        >
          <AreaChart
            data={data}
            margin={{ top: 2, right: 0, bottom: 0, left: 0 }}
          >
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const ts = payload[0]?.payload?.time as string | undefined;
                return (
                  <div className="rounded-md bg-popover px-2 py-1 text-xs font-mono shadow-md ring-1 ring-foreground/10 space-y-0.5">
                    {ts && tooltipExtra && (
                      <div className="text-foreground">{tooltipExtra(ts)}</div>
                    )}
                    {ts && (
                      <div className="text-[10px] text-muted-foreground">
                        {fmtTime(ts)}
                      </div>
                    )}
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
                stroke={PALETTE[i % PALETTE.length]}
                fill="transparent"
                strokeWidth={1.5}
                isAnimationActive={false}
                connectNulls={false}
                dot={false}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const latencyStrokes = [
  { width: 1.5, dash: undefined },
  { width: 1, dash: "4 2" },
  { width: 1, dash: "2 2" },
];

export function LatencySparkline({
  data,
  keys,
  unit = "ms",
  formatHeadline,
}: LatencyChartData & {
  formatHeadline?: (v: number) => { value: string; unit: string };
}) {
  const sloKey = keys.find((k) => k.label === "P95") ?? keys[0];
  if (!sloKey) return null;
  // Real (non-gap) values for a key — nulls are excluded so they don't
  // skew the percentile/headline/scale toward zero.
  const nums = (dataKey: string) =>
    data
      .map((d) => d[dataKey] as number | null)
      .filter((v): v is number => v != null);
  const headline = percentile(nums(sloKey.dataKey), 95);
  const headlineLevel = severity(headline, sloKey.threshold);
  const headlineFmt = formatHeadline
    ? formatHeadline(headline)
    : { value: fmt(headline), unit };
  const secondaryValues = keys
    .filter((k) => k !== sloKey)
    .map((k) => ({
      label: k.label,
      value: percentile(nums(k.dataKey), 95),
      threshold: k.threshold,
    }));
  const allMax = Math.max(
    ...keys.flatMap((k) => nums(k.dataKey)),
    ...keys.map((k) => k.threshold?.critical ?? 0),
  );

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-xs text-muted-foreground">Latency</p>
        <div className="flex items-center gap-2">
          {keys.map((k) => (
            <span key={k.dataKey} className="text-[10px] text-muted-foreground">
              {k.label}
            </span>
          ))}
        </div>
      </div>
      <p
        className={cn(
          "text-lg font-semibold font-mono",
          headlineLevel && severityTextClass[headlineLevel],
        )}
      >
        {headlineFmt.value}
        <span
          className={cn(
            "text-xs ml-0.5",
            headlineLevel
              ? severityTextClass[headlineLevel]
              : "text-muted-foreground",
          )}
        >
          {headlineFmt.unit}
        </span>
      </p>
      <p className="text-xs text-muted-foreground font-mono mt-0.5">
        {secondaryValues.map((s, i) => {
          const s_level = severity(s.value, s.threshold);
          const sf = formatHeadline
            ? formatHeadline(s.value)
            : { value: fmt(s.value), unit: "" };
          return (
            <span key={s.label}>
              {i > 0 && " · "}
              {s.label}{" "}
              <span className={cn(s_level && severityTextClass[s_level])}>
                {sf.value}
                {sf.unit}
              </span>
            </span>
          );
        })}
      </p>
      <div className="h-10 mt-1" style={{ minWidth: 0, minHeight: 0 }}>
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={1}
          minHeight={1}
        >
          <AreaChart
            data={data}
            margin={{ top: 2, right: 0, bottom: 0, left: 0 }}
          >
            <defs>
              <linearGradient
                id="spark-latency-fill"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor="var(--primary)"
                  stopOpacity={0.1}
                />
                <stop
                  offset="100%"
                  stopColor="var(--primary)"
                  stopOpacity={0}
                />
              </linearGradient>
              {keys.map((k) => {
                if (!k.threshold) return null;
                const cPct = 1 - k.threshold.critical / allMax;
                const wPct = 1 - k.threshold.warning / allMax;
                return (
                  <linearGradient
                    key={k.dataKey}
                    id={`spark-latency-stroke-${k.dataKey}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset={`${cPct * 100}%`}
                      stopColor="var(--color-severity-critical)"
                    />
                    <stop
                      offset={`${cPct * 100}%`}
                      stopColor="var(--color-severity-warning)"
                    />
                    <stop
                      offset={`${wPct * 100}%`}
                      stopColor="var(--color-severity-warning)"
                    />
                    <stop
                      offset={`${wPct * 100}%`}
                      stopColor="var(--primary)"
                    />
                  </linearGradient>
                );
              })}
            </defs>
            <YAxis hide domain={[0, allMax]} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const ts = payload[0]?.payload?.time as string | undefined;
                return (
                  <div className="rounded-md bg-popover px-2 py-1.5 shadow-md ring-1 ring-foreground/10 space-y-0.5">
                    {keys.map((k) => {
                      const entry = payload.find(
                        (p) => p.dataKey === k.dataKey,
                      );
                      if (!entry) return null;
                      const tt_level = severity(
                        entry.value as number,
                        k.threshold,
                      );
                      return (
                        <div
                          key={k.dataKey}
                          className="flex items-center justify-between gap-3 text-xs font-mono"
                        >
                          <span className="text-muted-foreground">
                            {k.label}
                          </span>
                          <span
                            className={cn(
                              tt_level && severityTextClass[tt_level],
                            )}
                          >
                            {(() => {
                              const v = entry.value as number;
                              const f = formatHeadline
                                ? formatHeadline(v)
                                : { value: fmt(v), unit };
                              return `${f.value}${f.unit}`;
                            })()}
                          </span>
                        </div>
                      );
                    })}
                    {ts && (
                      <div className="text-[10px] text-muted-foreground font-mono pt-0.5">
                        {fmtTime(ts)}
                      </div>
                    )}
                  </div>
                );
              }}
              cursor={{
                stroke: "var(--muted-foreground)",
                strokeWidth: 1,
                strokeDasharray: "3 3",
              }}
            />
            {[...keys].reverse().map((k) => {
              const i = keys.indexOf(k);
              return (
                <Area
                  key={k.dataKey}
                  type="monotone"
                  dataKey={k.dataKey}
                  stroke={
                    k.threshold
                      ? `url(#spark-latency-stroke-${k.dataKey})`
                      : "var(--primary)"
                  }
                  strokeDasharray={latencyStrokes[i]?.dash}
                  fill={i === 0 ? "url(#spark-latency-fill)" : "none"}
                  strokeWidth={latencyStrokes[i]?.width ?? 1}
                  dot={false}
                  isAnimationActive={false}
                />
              );
            })}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
