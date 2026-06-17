import { cn } from "@/lib/utils";

// MetricSlotChrome enforces the exact same outer dimensions as a live
// Sparkline / LatencySparkline so disabled / empty / loading / error
// states never cause layout reflow. The three-row shape mirrors the
// sparklines: title (text-[11px]), headline value (text-lg), body area
// (h-10 + 4px margin).
export function MetricSlotChrome({
  title,
  headline,
  body,
  className,
}: {
  title: React.ReactNode;
  headline: React.ReactNode;
  body: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-md", className)}>
      <p className="text-[11px] text-muted-foreground">{title}</p>
      <p className="text-lg font-semibold font-mono leading-7">{headline}</p>
      <div className="h-10 mt-1 flex items-end">{body}</div>
    </div>
  );
}
