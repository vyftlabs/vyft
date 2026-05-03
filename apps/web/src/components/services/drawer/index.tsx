import { XIcon } from "lucide-react";
import { motion } from "motion/react";
import { useRef, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { EventTimeline, type TimelineEntry } from "./timeline";

export interface DrawerTab {
  id: string;
  label: string;
  content: React.ReactNode;
}

export interface ServiceDrawerShellProps {
  name: React.ReactNode;
  icon?: React.ReactNode;
  tabs: DrawerTab[];
  defaultTab?: string;
  banner?: React.ReactNode;
  footer?: React.ReactNode;
  skipEntryAnimation?: boolean;
  expanded?: boolean;
  expandedContent?: React.ReactNode;
  onClose: () => void;
}

// --- Overview building blocks ---

export interface Threshold {
  warning: number;
  critical: number;
}

export interface SparklineData {
  title: string;
  data: Record<string, unknown>[];
  dataKey: string;
  unit: string;
  threshold?: Threshold;
}

export interface LatencyChartData {
  data: Record<string, unknown>[];
  keys: { dataKey: string; label: string; threshold?: Threshold }[];
  unit?: string;
}

export interface LogLine {
  timestamp: string;
  level: "info" | "warn" | "error" | "debug";
  message: string;
}

export type DetailView = "events" | "logs" | "metrics" | null;

export interface OverviewProps {
  sparklines?: SparklineData[][];
  latency?: LatencyChartData;
  timeline?: TimelineEntry[];
  logs?: LogLine[];
  onViewAll?: (view: "events" | "logs" | "metrics") => void;
}

export function Overview({
  sparklines = [],
  latency,
  timeline = [],
  logs,
  onViewAll,
}: OverviewProps) {
  const showTimeline = timeline !== undefined;
  const showLogs = logs !== undefined;
  return (
    <div className="flex flex-col gap-5 h-full">
      {(sparklines.length > 0 || latency) && (
        <div className="space-y-2 shrink-0">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium">Metrics</p>
            <button
              type="button"
              onClick={() => onViewAll?.("metrics")}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              View all
            </button>
          </div>
          {((sparklines[0]?.length ?? 0) > 0 || latency) && (
            <div className="grid grid-cols-3 gap-2">
              {sparklines[0]?.map((s) => (
                <Sparkline key={s.dataKey} {...s} />
              ))}
              {latency && <LatencySparkline {...latency} />}
            </div>
          )}
          {sparklines[1] && (
            <div
              className={cn("grid gap-2", `grid-cols-${sparklines[1].length}`)}
            >
              {sparklines[1].map((s) => (
                <Sparkline key={s.dataKey} {...s} />
              ))}
            </div>
          )}
        </div>
      )}

      {(showTimeline || showLogs) && (
        <div
          className={cn(
            "flex-1 min-h-0 grid gap-4",
            showTimeline && showLogs ? "grid-cols-2" : "grid-cols-1",
          )}
        >
          {showTimeline && (
            <div className="min-h-0 flex flex-col">
              <div className="flex items-center justify-between mb-2 shrink-0">
                <p className="text-xs font-medium">Events</p>
                <button
                  type="button"
                  onClick={() => onViewAll?.("events")}
                  className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  View all
                </button>
              </div>
              <div className="flex-1 min-h-0 relative">
                {timeline.length > 0 ? (
                  <ScrollArea className="h-full -mr-4">
                    <div className="pr-4">
                      <EventTimeline entries={timeline} />
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                    No events yet
                  </div>
                )}
                <div className="absolute bottom-0 inset-x-0 h-10 bg-gradient-to-t from-background to-transparent pointer-events-none" />
              </div>
            </div>
          )}
          {showLogs && (
            <div className="min-h-0 flex flex-col">
              <div className="flex items-center justify-between mb-2 shrink-0">
                <p className="text-xs font-medium">Logs</p>
                <button
                  type="button"
                  onClick={() => onViewAll?.("logs")}
                  className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  View all
                </button>
              </div>
              <div className="flex-1 min-h-0 relative">
                {logs && logs.length > 0 ? (
                  <ScrollArea className="h-full -mr-4">
                    <div className="pr-4">
                      <LogsPreview logs={logs} />
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                    No logs yet
                  </div>
                )}
                <div className="absolute bottom-0 inset-x-0 h-10 bg-gradient-to-t from-background to-transparent pointer-events-none" />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const logLevelClass: Record<LogLine["level"], string> = {
  error: "text-severity-critical-text",
  warn: "text-severity-warning-text",
  info: "text-foreground",
  debug: "text-muted-foreground",
};

function LogsPreview({ logs }: { logs: LogLine[] }) {
  return (
    <div className="font-mono text-[11px] leading-relaxed space-y-px">
      {logs.map((log) => (
        <div
          key={`${log.timestamp}-${log.message}-${log.level}`}
          className="flex gap-2 px-1 hover:bg-muted/50 rounded-sm"
        >
          <span className="text-muted-foreground shrink-0">
            {new Date(log.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: false,
            })}
          </span>
          <span
            className={cn("shrink-0 w-10 uppercase", logLevelClass[log.level])}
          >
            {log.level}
          </span>
          <span className="text-foreground truncate">{log.message}</span>
        </div>
      ))}
    </div>
  );
}

// --- Sparklines ---

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
}: SparklineData) {
  const values = data.map((d) => (d[dataKey] as number) ?? 0);
  const current = values.length > 0 ? (values[values.length - 1] ?? 0) : 0;
  const level = severity(current, threshold);

  // Build overlay data for threshold-colored segments
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
        {fmt(current)}
        <span
          className={cn(
            "text-xs ml-0.5",
            level ? severityTextClass[level] : "text-muted-foreground",
          )}
        >
          {unit}
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
                return (
                  <div
                    className={cn(
                      "rounded-md bg-popover px-2 py-1 text-xs font-mono shadow-md ring-1 ring-foreground/10",
                      s && severityTextClass[s],
                    )}
                  >
                    {fmt(v)}
                    {unit}
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
}: LatencyChartData) {
  const sloKey = keys.find((k) => k.label === "P95") ?? keys[0];
  if (!sloKey) return null;
  const sloValues = data.map((d) => (d[sloKey.dataKey] as number) ?? 0);
  const headline = percentile(sloValues, 95);
  const headlineLevel = severity(headline, sloKey.threshold);
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
        {fmt(headline)}
        <span
          className={cn(
            "text-xs ml-0.5",
            headlineLevel
              ? severityTextClass[headlineLevel]
              : "text-muted-foreground",
          )}
        >
          {unit}
        </span>
      </p>
      <p className="text-xs text-muted-foreground font-mono mt-0.5">
        {secondaryValues.map((s, i) => {
          const s_level = severity(s.value, s.threshold);
          return (
            <span key={s.label}>
              {i > 0 && " · "}
              {s.label}{" "}
              <span className={cn(s_level && severityTextClass[s_level])}>
                {fmt(s.value)}
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
                            {fmt(entry.value as number)}
                            {unit}
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

// --- Drawer shell ---

const drawerTransition = {
  type: "spring" as const,
  stiffness: 400,
  damping: 32,
  mass: 0.8,
};

export function ServiceDrawerShell({
  name,
  icon,
  tabs,
  defaultTab,
  banner,
  footer,
  skipEntryAnimation,
  expanded,
  expandedContent,
  onClose,
}: ServiceDrawerShellProps) {
  const [activeTab, setActiveTab] = useState(defaultTab ?? tabs[0]?.id);
  const prevDefaultTab = useRef(defaultTab);
  if (defaultTab !== prevDefaultTab.current) {
    prevDefaultTab.current = defaultTab;
    setActiveTab(defaultTab ?? tabs[0]?.id);
  }

  return (
    <>
      <motion.div
        className="absolute inset-0 z-40 bg-black/5"
        initial={skipEntryAnimation ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={expanded ? undefined : onClose}
      />

      <motion.div
        className="absolute z-50 flex flex-col bg-background shadow-lg overflow-hidden"
        initial={
          skipEntryAnimation
            ? false
            : {
                opacity: 0,
                scale: 0.96,
                x: 16,
                y: 16,
                bottom: 0,
                right: 0,
                width: "100%",
                maxWidth: "min(64rem, calc(100vw - 2rem))",
                height: "80%",
                borderTopLeftRadius: 8,
                borderWidth: 1,
              }
        }
        animate={
          expanded
            ? {
                opacity: 1,
                scale: 1,
                x: 0,
                y: 0,
                bottom: 0,
                right: 0,
                left: 0,
                top: 0,
                width: "100%",
                maxWidth: "100%",
                height: "100%",
                borderTopLeftRadius: 0,
                borderWidth: 0,
              }
            : {
                opacity: 1,
                scale: 1,
                x: 0,
                y: 0,
                bottom: 0,
                right: 0,
                width: "100%",
                maxWidth: "min(64rem, calc(100vw - 2rem))",
                height: "80%",
                borderTopLeftRadius: 8,
                borderWidth: 1,
              }
        }
        exit={{ opacity: 0, scale: 0.98, x: 10, y: 10 }}
        transition={drawerTransition}
        style={{
          minHeight: "24rem",
          borderColor: "var(--border)",
          borderStyle: "solid",
        }}
      >
        {expanded ? (
          expandedContent
        ) : (
          <>
            <div className="flex items-center justify-between px-6 py-4 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                {icon && (
                  <div className="shrink-0 text-foreground/70">{icon}</div>
                )}
                {typeof name === "string" ? (
                  <p className="text-lg font-semibold truncate">{name}</p>
                ) : (
                  name
                )}
              </div>
              <Button variant="ghost" size="icon-sm" onClick={onClose}>
                <XIcon className="size-4" />
              </Button>
            </div>

            {tabs.length > 0 && (
              <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className="flex flex-col flex-1 min-h-0"
              >
                {tabs.length > 1 && (
                  <TabsList
                    variant="line"
                    className="px-6 border-b !w-full !justify-start [&>*]:!flex-none [&>*]:mb-[-1px]"
                  >
                    {tabs.map((tab) => (
                      <TabsTrigger key={tab.id} value={tab.id}>
                        {tab.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                )}
                {banner}
                {tabs.map((tab) => (
                  <TabsContent
                    key={tab.id}
                    value={tab.id}
                    className="flex-1 min-h-0 px-6 pt-4 pb-6"
                  >
                    {tab.content}
                  </TabsContent>
                ))}
              </Tabs>
            )}

            {footer}
          </>
        )}
      </motion.div>
    </>
  );
}

export { ServiceDrawer } from "./service-drawer";
