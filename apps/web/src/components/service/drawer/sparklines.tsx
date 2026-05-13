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
}: SparklineData & {
  formatHeadline?: (v: number) => { value: string; unit: string };
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
    <div className="p-3">
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
                return (
                  <div
                    className={cn(
                      "rounded-md bg-popover px-2 py-1 text-xs font-mono shadow-md ring-1 ring-foreground/10",
                      s && severityTextClass[s],
                    )}
                  >
                    {formatted.value}
                    {formatted.unit}
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
  const sloValues = data.map((d) => (d[sloKey.dataKey] as number) ?? 0);
  const headline = percentile(sloValues, 95);
  const headlineLevel = severity(headline, sloKey.threshold);
  const headlineFmt = formatHeadline
    ? formatHeadline(headline)
    : { value: fmt(headline), unit };
  const secondaryValues = keys
    .filter((k) => k !== sloKey)
    .map((k) => ({
      label: k.label,
      value: percentile(
        data.map((d) => (d[k.dataKey] as number) ?? 0),
        95,
      ),
      threshold: k.threshold,
    }));
  const allMax = Math.max(
    ...keys.flatMap((k) => data.map((d) => (d[k.dataKey] as number) ?? 0)),
    ...keys.map((k) => k.threshold?.critical ?? 0),
  );

  return (
    <div className="p-3">
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
